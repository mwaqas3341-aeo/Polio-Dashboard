-- 1. TEAM TARGETS ARE PREPARED AUTOMATICALLY.
--    When an Area Incharge has SUBMITTED a team's Operational Plan (micro plan) for a day AND has answered and confirmed that team's plan questionnaire,
--    the team's target for that day is written to team_targets from the plan. A target typed by hand (auto_from_plan = false) is never overwritten.
alter table team_targets add column if not exists auto_from_plan boolean not null default false;
alter table team_targets add column if not exists source_plan_id uuid references operational_plans(id) on delete set null;

create or replace function prepare_team_targets(p_plan uuid) returns void language plpgsql security definer set search_path = public as $$
declare p operational_plans%rowtype; t teams%rowtype; answered boolean;
begin
  select * into p from operational_plans where id = p_plan; if not found or p.status <> 'submitted' then return; end if;
  select * into t from teams where id = p.team_id;
  select exists (select 1 from campaign_forms f
                 where f.campaign_id = p.campaign_id and f.form_type = 'plan_setup' and f.aic_staff_id = t.aic_staff_id
                   and (f.data -> 'teams' -> (t.team_no::text) ->> 'confirmed') = 'true'
                   and (f.data -> 'teams' -> (t.team_no::text) ->> 'mmp') in ('yes','no')
                   and (f.data -> 'teams' -> (t.team_no::text) ->> 'schools') in ('yes','no')) into answered;
  if not answered then return; end if;
  insert into team_targets (campaign_id, team_no, campaign_day, target_households, target_household_children, target_school_children, target_mmp_children, auto_from_plan, source_plan_id, set_by)
  values (p.campaign_id, t.team_no, p.campaign_day, coalesce(p.total_households, 0), coalesce(p.children_households_1_5, 0) + coalesce(p.children_under_1, 0), coalesce(p.school_children, 0), coalesce(p.mmp_children, 0), true, p.id, p.submitted_by)
  on conflict (campaign_id, team_no, campaign_day) do update
    set target_households = excluded.target_households, target_household_children = excluded.target_household_children, target_school_children = excluded.target_school_children,
        target_mmp_children = excluded.target_mmp_children, source_plan_id = excluded.source_plan_id, updated_at = now()
    where team_targets.auto_from_plan;
end $$;
revoke all on function prepare_team_targets(uuid) from public, anon, authenticated;

create or replace function operational_plans_targets_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin perform prepare_team_targets(new.id); return null; end $$;
drop trigger if exists operational_plans_targets on operational_plans;
create trigger operational_plans_targets after insert or update on operational_plans for each row execute function operational_plans_targets_trg();

-- the questionnaire may be completed after the plan was submitted: prepare the targets of that Area Incharge's submitted plans then
create or replace function plan_setup_targets_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.form_type <> 'plan_setup' then return null; end if;
  for r in select p.id from operational_plans p join teams t on t.id = p.team_id where p.campaign_id = new.campaign_id and t.aic_staff_id = new.aic_staff_id and p.status = 'submitted' loop
    perform prepare_team_targets(r.id);
  end loop;
  return null;
end $$;
drop trigger if exists plan_setup_targets on campaign_forms;
create trigger plan_setup_targets after insert or update on campaign_forms for each row execute function plan_setup_targets_trg();

-- one-off: prepare the targets of everything already submitted and answered
do $$ declare r record; begin for r in select id from operational_plans where status = 'submitted' loop perform prepare_team_targets(r.id); end loop; end $$;

-- 2. CARRY THE PREVIOUS CAMPAIGN'S PLANNING DATA INTO THE NEXT ONE (nothing has to be typed again).
--    Master data (staff, teams, schools, MMP contacts, calculation formulas) already lives at union-council level and is shared by every campaign.
--    What is campaign-specific is copied here, always as DRAFT for review: plans keep their wording and figures but need their pictures and a new submission.
create table if not exists campaign_carry_over_log (
  id uuid primary key default gen_random_uuid(),
  from_campaign_id uuid not null references campaigns(id) on delete cascade,
  to_campaign_id uuid not null references campaigns(id) on delete cascade,
  counts jsonb not null default '{}'::jsonb,
  done_by uuid default auth.uid(), done_at timestamptz not null default now()
);
create index if not exists campaign_carry_over_log_to_idx on campaign_carry_over_log (to_campaign_id);
alter table campaign_carry_over_log enable row level security;
drop policy if exists ccl_select on campaign_carry_over_log;
create policy ccl_select on campaign_carry_over_log for select using (exists (select 1 from campaigns c where c.id = to_campaign_id and (c.uc_id is null or c.uc_id in (select user_scope_uc_ids()))));

create or replace function carry_over_campaign_data(p_from uuid, p_to uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare n_setup int := 0; n_figs int := 0; n_schools int := 0; n_mmp int := 0; n_plans int := 0; n_ft int := 0; n_maps int := 0; res jsonb;
begin
  if not plan_manager() then raise exception 'Only an administrator, district coordinator or UCMO can copy plan data'; end if;
  if p_from = p_to then raise exception 'Choose two different campaigns'; end if;
  if (select count(*) from campaigns where id in (p_from, p_to) and (uc_id is null or uc_id in (select user_scope_uc_ids()))) < 2 then raise exception 'Campaign not found'; end if;
  if (select uc_id from campaigns where id = p_from) is distinct from (select uc_id from campaigns where id = p_to) then raise exception 'The two campaigns belong to different union councils'; end if;

  -- plan questionnaire answers (yes/no) are copied, but every team must confirm them again for the new campaign
  insert into campaign_forms (campaign_id, aic_staff_id, form_type, data)
  select p_to, f.aic_staff_id, 'plan_setup',
         jsonb_set(f.data, '{teams}', coalesce((select jsonb_object_agg(k, v || '{"confirmed": false}'::jsonb) from jsonb_each(f.data -> 'teams') as e(k, v)), '{}'::jsonb))
  from campaign_forms f where f.campaign_id = p_from and f.form_type = 'plan_setup' and f.data ? 'teams'
    and not exists (select 1 from campaign_forms x where x.campaign_id = p_to and x.form_type = 'plan_setup' and x.aic_staff_id = f.aic_staff_id);
  get diagnostics n_setup = row_count;

  insert into aic_microplan_figures (campaign_id, aic_staff_id, figures)
  select p_to, g.aic_staff_id, g.figures from aic_microplan_figures g where g.campaign_id = p_from
    and not exists (select 1 from aic_microplan_figures x where x.campaign_id = p_to and x.aic_staff_id = g.aic_staff_id);
  get diagnostics n_figs = row_count;

  insert into school_assignments (campaign_id, school_id, team_no, campaign_day, target_children)
  select p_to, s.school_id, s.team_no, s.campaign_day, s.target_children from school_assignments s where s.campaign_id = p_from
    and not exists (select 1 from school_assignments x where x.campaign_id = p_to and x.school_id = s.school_id);
  get diagnostics n_schools = row_count;

  insert into mmp_assignments (campaign_id, mmp_contact_id, team_no, campaign_day, house_count, child_count)
  select p_to, m.mmp_contact_id, m.team_no, m.campaign_day, m.house_count, m.child_count from mmp_assignments m where m.campaign_id = p_from
    and not exists (select 1 from mmp_assignments x where x.campaign_id = p_to and x.mmp_contact_id = m.mmp_contact_id);
  get diagnostics n_mmp = row_count;

  -- operational plans: wording and household / children figures are kept; totals, doses and capsules are recalculated by the plan trigger; status = draft
  insert into operational_plans (campaign_id, team_id, campaign_day, village_area, community_vaccination_place, team_group, working_order, head_first_family, head_last_family, total_households, children_households_1_5, children_under_1, status)
  select p_to, o.team_id, o.campaign_day, o.village_area, o.community_vaccination_place, o.team_group, o.working_order, o.head_first_family, o.head_last_family, o.total_households, o.children_households_1_5, o.children_under_1, 'draft'
  from operational_plans o where o.campaign_id = p_from
    and not exists (select 1 from operational_plans x where x.campaign_id = p_to and x.team_id = o.team_id and x.campaign_day = o.campaign_day);
  get diagnostics n_plans = row_count;

  insert into fixed_transit_plans (campaign_id, team_id, campaign_day, place_name, full_address, prev_campaign_children, status)
  select p_to, o.team_id, o.campaign_day, o.place_name, o.full_address, coalesce(o.expected_children, o.prev_campaign_children), 'draft'
  from fixed_transit_plans o where o.campaign_id = p_from
    and not exists (select 1 from fixed_transit_plans x where x.campaign_id = p_to and x.team_id = o.team_id and x.campaign_day = o.campaign_day);
  get diagnostics n_ft = row_count;

  insert into team_day_maps (campaign_id, team_id, campaign_day, storage_path)
  select p_to, m.team_id, m.campaign_day, m.storage_path from team_day_maps m where m.campaign_id = p_from
    and not exists (select 1 from team_day_maps x where x.campaign_id = p_to and x.team_id = m.team_id and x.campaign_day = m.campaign_day);
  get diagnostics n_maps = row_count;

  res := jsonb_build_object('questionnaires', n_setup, 'aic_figures', n_figs, 'school_assignments', n_schools, 'mmp_assignments', n_mmp, 'operational_plans', n_plans, 'fixed_transit_plans', n_ft, 'team_day_maps', n_maps);
  insert into campaign_carry_over_log (from_campaign_id, to_campaign_id, counts) values (p_from, p_to, res);
  return res;
end $$;
revoke all on function carry_over_campaign_data(uuid, uuid) from public, anon; grant execute on function carry_over_campaign_data(uuid, uuid) to authenticated;
