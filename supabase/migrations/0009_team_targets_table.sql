-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Team targets — the AIC's own plan numbers, entered by hand in the
-- portal for each team + campaign day. These are what the 2A form,
-- Logistic Plan, and Area Incharge Summary use as "the plan" from now
-- on. team_day_plan (computed from School list / House registration /
-- MMP inputs) still exists as a cross-check reference, not the target.

create table team_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  campaign_day int not null,
  target_households int not null default 0,
  target_children int not null default 0,
  notes text,
  set_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, team_no, campaign_day)
);

alter table team_targets enable row level security;

create policy team_targets_select on team_targets for select using (
  campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
);
create policy team_targets_write on team_targets for insert with check (
  can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
);
create policy team_targets_update on team_targets for update using (
  can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
);
create policy team_targets_delete on team_targets for delete using (
  can_manage() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
);

create trigger team_targets_audit after insert or update or delete on team_targets
  for each row execute function audit_trigger_fn();

-- ---------- Rebuild the plan views around team_targets ----------
drop view if exists area_incharge_summary;
drop view if exists logistic_plan;

-- team_plan: the authoritative plan (AIC-entered target), with the
-- auto-computed register sums alongside as a reference/cross-check.
create view team_plan as
select
  tt.campaign_id,
  tt.team_no,
  tt.campaign_day,
  tt.target_households,
  tt.target_children,
  round(tt.target_children * 1.11, 2) as vaccine_needed,
  coalesce(tdp.school_children, 0) as computed_school_children,
  coalesce(tdp.household_children, 0) as computed_household_children,
  coalesce(tdp.total_children, 0) as computed_total_children,
  coalesce(tdp.target_households, 0) as computed_households
from team_targets tt
left join team_day_plan tdp
  on tdp.campaign_id = tt.campaign_id and tdp.team_no = tt.team_no and tdp.campaign_day = tt.campaign_day;

alter view team_plan set (security_invoker = true);

-- Logistic plan now derives its quantities from the AIC's target, not
-- the raw register sums.
create view logistic_plan as
select
  tp.*,
  coalesce(hh.children_under_12m, 0) as household_children_under_12m,
  coalesce(hh.children_12_59m, 0) as household_children_12_59m,
  coalesce(hh.children_under_12m, 0) as blue_capsules_needed,
  coalesce(hh.children_12_59m, 0) as red_capsules_needed,
  1 as vaccine_carriers_needed,
  4 as ice_packs_needed,
  1 as ddm_cards_needed,
  1 as tally_sheets_needed
from team_plan tp
left join (
  select campaign_id, team_no, campaign_day,
    sum(children_under_12m) as children_under_12m,
    sum(children_12_59m) as children_12_59m
  from households
  group by campaign_id, team_no, campaign_day
) hh on hh.campaign_id = tp.campaign_id and hh.team_no = tp.team_no and hh.campaign_day = tp.campaign_day;

alter view logistic_plan set (security_invoker = true);

-- Area Incharge summary now rolls up the AIC's targets, not the register sums.
create view area_incharge_summary as
select
  campaign_id,
  count(*) as team_day_plans,
  count(distinct team_no) as teams_covered,
  sum(target_children) as grand_total_children,
  round(sum(vaccine_needed), 2) as grand_vaccine_needed,
  sum(target_households) as grand_target_households
from team_plan
group by campaign_id;

alter view area_incharge_summary set (security_invoker = true);
