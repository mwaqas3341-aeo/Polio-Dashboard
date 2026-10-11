-- 1. Operational Plan total children now = household children + under-1 + school + MMP children (doses stay total x 1.11).
--    Only the one expression is changed; existing rows keep their stored figures until the plan is next saved.
do $$ declare d text; d2 text;
begin
  select pg_get_functiondef('public.operational_plans_biu()'::regprocedure) into d;
  d2 := replace(d, 'new.total_children := coalesce(new.children_households_1_5, 0) + coalesce(new.children_under_1, 0) + new.school_children;',
                   'new.total_children := coalesce(new.children_households_1_5, 0) + coalesce(new.children_under_1, 0) + new.school_children + coalesce(new.mmp_children, 0);');
  if d2 = d then raise exception 'operational_plans_biu total expression not found'; end if;
  execute d2;
end $$;

-- 2. Fixed-site / transit-point plan: one row per campaign x fixed-or-transit team x day (1..5), NO maps.
--    Transit teams: adda / bus stand / area. Fixed teams: hospital. Blank (null) means "not answered yet", never a fake zero.
create table if not exists fixed_transit_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_id uuid not null references teams(id),
  campaign_day int not null check (campaign_day between 1 and 5),
  place_name text,                 -- adda / area (transit) or hospital (fixed)
  full_address text,               -- جگہ کا نام و مکمل پتہ
  prev_campaign_children int check (prev_campaign_children is null or prev_campaign_children >= 0),
  expected_children int check (expected_children is null or expected_children >= 0),
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz, submitted_by uuid,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, team_id, campaign_day)
);
create index if not exists ft_plans_campaign_idx on fixed_transit_plans (campaign_id, campaign_day);
create index if not exists ft_plans_team_idx on fixed_transit_plans (team_id);

create or replace function fixed_transit_plans_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; c campaigns%rowtype;
begin
  select * into t from teams where id = new.team_id;
  select * into c from campaigns where id = new.campaign_id;
  if t.team_type is null or t.team_type not in ('fixed','transit') then raise exception 'This plan is only for Fixed and Transit teams (Team % is %)', t.team_no, coalesce(t.team_type,'not set'); end if;
  if c.uc_id is not null and t.uc_id <> c.uc_id then raise exception 'This team does not belong to the campaign''s union council'; end if;
  if tg_op = 'INSERT' and c.status = 'closed' then raise exception 'The campaign is closed'; end if;
  if tg_op = 'UPDATE' then
    if old.campaign_id <> new.campaign_id or old.team_id <> new.team_id or old.campaign_day <> new.campaign_day then raise exception 'Campaign, team and day of a plan cannot be changed'; end if;
    if old.status = 'submitted' and not plan_manager() and auth.uid() is not null then raise exception 'This plan is already submitted. Ask your UCMO or administrator to reopen it.'; end if;
  end if;
  new.place_name := nullif(trim(coalesce(new.place_name,'')), '');
  new.full_address := nullif(trim(coalesce(new.full_address,'')), '');
  new.updated_at := now();
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    if new.place_name is null then raise exception 'Enter the % name for Day %', case when t.team_type = 'fixed' then 'hospital' else 'adda / area' end, new.campaign_day; end if;
    new.submitted_at := now(); new.submitted_by := auth.uid();
  end if;
  if new.status = 'draft' and tg_op = 'UPDATE' and old.status = 'submitted' then new.submitted_at := null; new.submitted_by := null; end if;
  return new;
end $$;
drop trigger if exists fixed_transit_plans_biu_trg on fixed_transit_plans;
create trigger fixed_transit_plans_biu_trg before insert or update on fixed_transit_plans for each row execute function fixed_transit_plans_biu();

alter table fixed_transit_plans enable row level security;
drop policy if exists ft_plans_select on fixed_transit_plans; drop policy if exists ft_plans_insert on fixed_transit_plans;
drop policy if exists ft_plans_update on fixed_transit_plans; drop policy if exists ft_plans_delete on fixed_transit_plans;
create policy ft_plans_select on fixed_transit_plans for select using (plan_team_visible(team_id));
create policy ft_plans_insert on fixed_transit_plans for insert with check (can_enter_data() and plan_team_visible(team_id));
create policy ft_plans_update on fixed_transit_plans for update using (can_enter_data() and plan_team_visible(team_id)) with check (can_enter_data() and plan_team_visible(team_id));
create policy ft_plans_delete on fixed_transit_plans for delete using (plan_manager() and plan_team_visible(team_id));

drop trigger if exists fixed_transit_plans_audit on fixed_transit_plans;
create trigger fixed_transit_plans_audit after insert or update or delete on fixed_transit_plans for each row execute function audit_trigger_fn();
