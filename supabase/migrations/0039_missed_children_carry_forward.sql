-- Missed children across campaigns. missed_children keeps ONE ROW PER CHILD PER CAMPAIGN (the existing screens, plan counts and 2A/2B all rely on that),
-- and origin_child_id ties the rows of the same child together, so a child is one identity however many campaigns he or she is missed in.
-- Additive only: no existing column, row or policy is changed.
alter table missed_children
  add column if not exists origin_child_id uuid,
  add column if not exists status text not null default 'missed' check (status in ('missed','vaccinated','resolved')),
  add column if not exists source text not null default 'entered' check (source in ('entered','carried','import')),
  add column if not exists review_flag text,                                   -- why a record needs a human decision (e.g. no team / ambiguous area)
  add column if not exists import_key text,                                    -- stable key of an imported source row (makes re-import idempotent)
  add column if not exists extra jsonb not null default '{}'::jsonb,           -- every other source column, kept as received
  add column if not exists last_missed_campaign_id uuid references campaigns(id),
  add column if not exists still_missed_confirmed_at timestamptz,
  add column if not exists still_missed_confirmed_by uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
update missed_children set origin_child_id = id where origin_child_id is null;
update missed_children set status = 'vaccinated' where covered_this_round and status = 'missed';
alter table missed_children alter column origin_child_id set not null;
create unique index if not exists missed_children_campaign_origin_uq on missed_children (campaign_id, origin_child_id);
create unique index if not exists missed_children_import_key_uq on missed_children (import_key) where import_key is not null;
create index if not exists missed_children_origin_idx on missed_children (origin_child_id);

create or replace function missed_children_biu() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.origin_child_id := coalesce(new.origin_child_id, new.id); end if;
  -- covered_this_round (used by the existing screens) and status are kept in step
  if new.status = 'missed' and new.covered_this_round then new.status := 'vaccinated'; end if;
  if new.status in ('vaccinated','resolved') then new.covered_this_round := true; new.resolved_at := coalesce(new.resolved_at, now()); end if;
  if new.status = 'missed' then new.last_missed_campaign_id := new.campaign_id; new.resolved_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists missed_children_biu_trg on missed_children;
create trigger missed_children_biu_trg before insert or update on missed_children for each row execute function missed_children_biu();

-- history of every status change / campaign association of a child
create table if not exists missed_child_events (
  id uuid primary key default gen_random_uuid(),
  origin_child_id uuid not null,
  missed_child_id uuid,
  campaign_id uuid references campaigns(id) on delete set null,
  event text not null, old_status text, new_status text, note text,
  by_user uuid default auth.uid(), at timestamptz not null default now()
);
create index if not exists missed_child_events_origin_idx on missed_child_events (origin_child_id, at);
alter table missed_child_events enable row level security;
drop policy if exists mce_select on missed_child_events;
create policy mce_select on missed_child_events for select using (exists (select 1 from missed_children m where m.origin_child_id = missed_child_events.origin_child_id and m.campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))));
create or replace function missed_children_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then insert into missed_child_events(origin_child_id, missed_child_id, campaign_id, event, new_status, note) values (new.origin_child_id, new.id, new.campaign_id, case new.source when 'carried' then 'carried_forward' when 'import' then 'imported' else 'recorded' end, new.status, new.review_flag);
  elsif new.status is distinct from old.status or new.still_missed_confirmed_at is distinct from old.still_missed_confirmed_at then
    insert into missed_child_events(origin_child_id, missed_child_id, campaign_id, event, old_status, new_status) values (new.origin_child_id, new.id, new.campaign_id, case when new.status is distinct from old.status then 'status_changed' else 'confirmed_still_missed' end, old.status, new.status);
  end if; return null;
end $$;
drop trigger if exists missed_children_log_trg on missed_children;
create trigger missed_children_log_trg after insert or update on missed_children for each row execute function missed_children_log();

-- Carry the children that are STILL MISSED in one campaign into the next. Idempotent (a child is never added twice to the same campaign).
-- Team and day are left empty: they must be assigned afresh for the new campaign by an authorised user (nothing is guessed). The old team is kept in extra.
create or replace function carry_forward_missed_children_internal(p_from uuid, p_to uuid) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_from = p_to then return 0; end if;
  insert into missed_children (campaign_id, child_name, father_name, age_months, address, team_no, campaign_day, house_no, origin_child_id, status, source, review_flag, extra, carried_from_campaign_id, last_missed_campaign_id)
  select p_to, m.child_name, m.father_name, m.age_months, m.address, null, null, null, m.origin_child_id, 'missed', 'carried', 'assign_team',
         m.extra || jsonb_build_object('previous_team_no', m.team_no, 'previous_campaign_day', m.campaign_day, 'previous_house_no', m.house_no), p_from, p_from
  from missed_children m
  where m.campaign_id = p_from and m.status = 'missed'
    and not exists (select 1 from missed_children x where x.campaign_id = p_to and x.origin_child_id = m.origin_child_id);
  get diagnostics n = row_count; return n;
end $$;
revoke all on function carry_forward_missed_children_internal(uuid,uuid) from public, anon, authenticated;
create or replace function carry_forward_missed_children(p_from uuid, p_to uuid) returns int language plpgsql security definer set search_path = public as $$
begin
  if not can_enter_data() or not plan_manager() then raise exception 'Not allowed'; end if;
  if (select count(*) from campaigns where id in (p_from, p_to) and (uc_id is null or uc_id in (select user_scope_uc_ids()))) < 2 then raise exception 'Campaign not found'; end if;
  return carry_forward_missed_children_internal(p_from, p_to);
end $$;
revoke all on function carry_forward_missed_children(uuid,uuid) from public, anon; grant execute on function carry_forward_missed_children(uuid,uuid) to authenticated;

-- when a new campaign is created, the children still missed in the previous campaign of the same UC become available in it
create or replace function campaigns_carry_missed_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare prev uuid;
begin
  select id into prev from campaigns where id <> new.id and uc_id is not distinct from new.uc_id and start_date < new.start_date order by start_date desc limit 1;
  if prev is not null then perform carry_forward_missed_children_internal(prev, new.id); end if;
  return new;
end $$;
drop trigger if exists campaigns_carry_missed on campaigns;
create trigger campaigns_carry_missed after insert on campaigns for each row execute function campaigns_carry_missed_trg();

-- final-day confirmation of a team's still-missed children (or an explicit "none")
create table if not exists missed_children_confirmations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  outcome text not null check (outcome in ('confirmed','none')),
  child_count int not null default 0 check (child_count >= 0),
  note text, confirmed_by uuid default auth.uid(), confirmed_at timestamptz not null default now(),
  unique (campaign_id, team_no)
);
alter table missed_children_confirmations enable row level security;
drop policy if exists mcc_select on missed_children_confirmations;
create policy mcc_select on missed_children_confirmations for select using (campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create or replace function confirm_still_missed(p_campaign uuid, p_team int, p_none boolean, p_note text default null) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not can_enter_data() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from campaigns c where c.id = p_campaign and (c.uc_id is null or c.uc_id in (select user_scope_uc_ids()))) or not aic_owns_team(p_campaign, p_team) then raise exception 'Not allowed for this team'; end if;
  select count(*) into n from missed_children where campaign_id = p_campaign and team_no = p_team and status = 'missed';
  if p_none then
    if n > 0 then raise exception 'Team % still has % child(ren) marked as missed. Mark them covered first, or confirm them as still missed.', p_team, n; end if;
    if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'Please add a short note confirming that no children remain missed.'; end if;
  else
    if n = 0 then raise exception 'No still-missed children are entered for team %. Add them, or choose "No children remain missed".', p_team; end if;
    if exists (select 1 from missed_children where campaign_id = p_campaign and team_no = p_team and status = 'missed' and (length(trim(coalesce(child_name,''))) = 0 or (coalesce(address,'') = '' and house_no is null))) then raise exception 'Every still-missed child needs a name and an address or house number.'; end if;
    update missed_children set still_missed_confirmed_at = now(), still_missed_confirmed_by = auth.uid() where campaign_id = p_campaign and team_no = p_team and status = 'missed';
  end if;
  insert into missed_children_confirmations(campaign_id, team_no, outcome, child_count, note) values (p_campaign, p_team, case when p_none then 'none' else 'confirmed' end, case when p_none then 0 else n end, nullif(trim(coalesce(p_note,'')),''))
  on conflict (campaign_id, team_no) do update set outcome = excluded.outcome, child_count = excluded.child_count, note = excluded.note, confirmed_by = auth.uid(), confirmed_at = now();
  return n;
end $$;
revoke all on function confirm_still_missed(uuid,int,boolean,text) from public, anon; grant execute on function confirm_still_missed(uuid,int,boolean,text) to authenticated;
