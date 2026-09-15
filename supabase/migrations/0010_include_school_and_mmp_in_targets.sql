-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Fix: the computed reference numbers (team_day_plan) only ever summed
-- School list + House registration — MMP/HRMP assignments were never
-- included, so an AIC setting a target from that reference could miss
-- MMP/HRMP children entirely. This rebuilds team_day_plan to include
-- MMP, and splits team_targets into explicit school/household/MMP
-- components (summed automatically) so none of the three can be left
-- out of the total by mistake.

drop view if exists area_incharge_summary;
drop view if exists logistic_plan;
drop view if exists team_plan;
drop view if exists team_day_plan;

create view team_day_plan as
select
  c.id as campaign_id,
  t.team_no,
  t.campaign_day,
  coalesce(sa.school_children, 0) as school_children,
  coalesce(hh.household_children, 0) as household_children,
  coalesce(mmp.mmp_children, 0) as mmp_children,
  coalesce(sa.school_children,0) + coalesce(hh.household_children,0) + coalesce(mmp.mmp_children,0) as total_children,
  coalesce(hh.total_houses, 0) as household_houses,
  coalesce(mmp.mmp_houses, 0) as mmp_houses
from campaigns c
cross join lateral (
  select distinct team_no, campaign_day from school_assignments where campaign_id = c.id
  union select distinct team_no, campaign_day from households where campaign_id = c.id
  union select distinct team_no, campaign_day from mmp_assignments where campaign_id = c.id
) t
left join (
  select campaign_id, team_no, campaign_day, sum(target_children) as school_children
  from school_assignments group by campaign_id, team_no, campaign_day
) sa on sa.campaign_id = c.id and sa.team_no = t.team_no and sa.campaign_day = t.campaign_day
left join (
  select campaign_id, team_no, campaign_day,
    count(*) as total_houses,
    sum(children_under_12m + children_12_59m) as household_children
  from households group by campaign_id, team_no, campaign_day
) hh on hh.campaign_id = c.id and hh.team_no = t.team_no and hh.campaign_day = t.campaign_day
left join (
  select campaign_id, team_no, campaign_day,
    sum(house_count) as mmp_houses,
    sum(child_count) as mmp_children
  from mmp_assignments group by campaign_id, team_no, campaign_day
) mmp on mmp.campaign_id = c.id and mmp.team_no = t.team_no and mmp.campaign_day = t.campaign_day;

alter view team_day_plan set (security_invoker = true);

-- ---------- team_targets: explicit components so nothing gets left out ----------
alter table team_targets add column if not exists target_school_children int not null default 0;
alter table team_targets add column if not exists target_household_children int not null default 0;
alter table team_targets add column if not exists target_mmp_children int not null default 0;

update team_targets set target_household_children = target_children
where target_children > 0 and target_school_children = 0 and target_household_children = 0 and target_mmp_children = 0;

alter table team_targets drop column if exists target_children;
alter table team_targets add column target_children int
  generated always as (target_school_children + target_household_children + target_mmp_children) stored;

-- ---------- Rebuild the dependent views ----------
create view team_plan as
select
  tt.campaign_id,
  tt.team_no,
  tt.campaign_day,
  tt.target_school_children,
  tt.target_household_children,
  tt.target_mmp_children,
  tt.target_children,
  tt.target_households,
  round(tt.target_children * 1.11, 2) as vaccine_needed,
  coalesce(tdp.school_children, 0) as computed_school_children,
  coalesce(tdp.household_children, 0) as computed_household_children,
  coalesce(tdp.mmp_children, 0) as computed_mmp_children,
  coalesce(tdp.total_children, 0) as computed_total_children,
  coalesce(tdp.household_houses, 0) + coalesce(tdp.mmp_houses, 0) as computed_households
from team_targets tt
left join team_day_plan tdp
  on tdp.campaign_id = tt.campaign_id and tdp.team_no = tt.team_no and tdp.campaign_day = tt.campaign_day;

alter view team_plan set (security_invoker = true);

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
