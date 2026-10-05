-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-06 (as uc_plan_and_roster_snapshots).
-- Simple structure planning per union council + frozen copy of each campaign's roster.
-- Staff, AICs and teams are permanent records that carry over from one campaign to the next;
-- when a campaign is closed its roster is saved as a snapshot so it can still be viewed later.

create table if not exists uc_plans (
  uc_id uuid primary key references union_councils(id) on delete cascade,
  total_aics int not null check (total_aics between 1 and 20),
  total_teams int not null check (total_teams between 1 and 200),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table uc_plans enable row level security;
drop policy if exists uc_plans_select on uc_plans; drop policy if exists uc_plans_insert on uc_plans; drop policy if exists uc_plans_update on uc_plans;
create policy uc_plans_select on uc_plans for select using (uc_id in (select user_scope_uc_ids()));
create policy uc_plans_insert on uc_plans for insert with check (app_user_role() in ('admin','district_coordinator','ucmo') and uc_id in (select user_scope_uc_ids()));
create policy uc_plans_update on uc_plans for update using (app_user_role() in ('admin','district_coordinator','ucmo') and uc_id in (select user_scope_uc_ids()))
  with check (app_user_role() in ('admin','district_coordinator','ucmo') and uc_id in (select user_scope_uc_ids()));

create or replace function set_uc_plan(p_uc uuid, p_aics int, p_teams int) returns void
language plpgsql set search_path = public as $$
declare max_aic int; max_team int;
begin
  select coalesce(max(aic_no),0) into max_aic from staff where uc_id = p_uc and designation = 'aic';
  select coalesce(max(team_no),0) into max_team from teams where uc_id = p_uc;
  if p_aics < max_aic then raise exception 'AIC % already exists in this union council — the number of AICs cannot be less than %', max_aic, max_aic; end if;
  if p_teams < max_team then raise exception 'Team % already exists in this union council — the number of teams cannot be less than %', max_team, max_team; end if;
  insert into uc_plans (uc_id, total_aics, total_teams) values (p_uc, p_aics, p_teams)
  on conflict (uc_id) do update set total_aics = excluded.total_aics, total_teams = excluded.total_teams, updated_by = auth.uid(), updated_at = now();
end $$;
grant execute on function set_uc_plan(uuid,int,int) to authenticated;
revoke all on function set_uc_plan(uuid,int,int) from public, anon;

create or replace function enforce_uc_plan_staff() returns trigger language plpgsql set search_path = public as $$
declare p int;
begin
  if new.designation = 'aic' then
    select total_aics into p from uc_plans where uc_id = new.uc_id;
    if p is not null and new.aic_no > p then raise exception 'This union council is planned for % Area Incharges — increase the number first', p; end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_uc_plan_staff_trg on staff;
create trigger enforce_uc_plan_staff_trg before insert or update of aic_no on staff for each row execute function enforce_uc_plan_staff();

create or replace function enforce_uc_plan_teams() returns trigger language plpgsql set search_path = public as $$
declare p int;
begin
  select total_teams into p from uc_plans where uc_id = new.uc_id;
  if p is not null and new.team_no > p then raise exception 'This union council is planned for % teams — increase the number first', p; end if;
  return new;
end $$;
drop trigger if exists enforce_uc_plan_teams_trg on teams;
create trigger enforce_uc_plan_teams_trg before insert or update of team_no on teams for each row execute function enforce_uc_plan_teams();

-- ---------- roster snapshots ----------
create table if not exists campaign_roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  uc_id uuid not null references union_councils(id),
  reason text not null default 'manual',
  planned_aics int, planned_teams int,
  data jsonb not null,
  taken_by uuid default auth.uid(),
  taken_at timestamptz not null default now()
);
create index if not exists crs_campaign_idx on campaign_roster_snapshots (campaign_id, uc_id, taken_at desc);
alter table campaign_roster_snapshots enable row level security;
drop policy if exists crs_select on campaign_roster_snapshots;
create policy crs_select on campaign_roster_snapshots for select using (uc_id in (select user_scope_uc_ids()) and app_user_role() <> 'aic');
-- no insert/update/delete policies: snapshots are written only by snapshot_campaign_roster()

create or replace function snapshot_campaign_roster(p_campaign uuid, p_reason text default 'manual') returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; u record;
begin
  if not can_manage() then raise exception 'Not allowed'; end if;
  for u in select id from union_councils where id in (select user_scope_uc_ids()) loop
    insert into campaign_roster_snapshots (campaign_id, uc_id, reason, planned_aics, planned_teams, data)
    select p_campaign, u.id, p_reason, (select total_aics from uc_plans where uc_id = u.id), (select total_teams from uc_plans where uc_id = u.id),
      jsonb_build_object(
        'ucmo', (select jsonb_build_object('name', s.full_name, 'cnic', s.cnic, 'cell', s.phone) from staff s where s.uc_id = u.id and s.designation = 'ucmo' and s.status = 'active' limit 1),
        'aics', coalesce((select jsonb_agg(jsonb_build_object('aic_no', a.aic_no, 'name', a.full_name, 'cnic', a.cnic, 'cell', a.phone,
            'driver', (select jsonb_build_object('name', d.full_name, 'cnic', d.cnic, 'cell', d.phone) from staff d where d.aic_staff_id = a.id and d.designation = 'driver' and d.status = 'active' limit 1),
            'teams', coalesce((select jsonb_agg(jsonb_build_object('team_no', t.team_no, 'type', t.team_type,
                'members', coalesce((select jsonb_agg(jsonb_build_object('no', tm.member_no, 'name', s2.full_name, 'cnic', s2.cnic, 'cell', s2.phone) order by tm.member_no)
                           from team_members tm join staff s2 on s2.id = tm.staff_id where tm.team_id = t.id and tm.active), '[]'::jsonb)) order by t.team_no)
              from teams t where t.aic_staff_id = a.id), '[]'::jsonb)) order by a.aic_no)
          from staff a where a.uc_id = u.id and a.designation = 'aic' and a.status = 'active'), '[]'::jsonb));
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function snapshot_campaign_roster(uuid,text) to authenticated;
revoke all on function snapshot_campaign_roster(uuid,text) from public, anon;

create or replace function campaign_closed_snapshot() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' and can_manage() then
    perform snapshot_campaign_roster(new.id, 'closed');
  end if;
  return new;
end $$;
drop trigger if exists campaign_closed_snapshot_trg on campaigns;
create trigger campaign_closed_snapshot_trg after update of status on campaigns for each row execute function campaign_closed_snapshot();
