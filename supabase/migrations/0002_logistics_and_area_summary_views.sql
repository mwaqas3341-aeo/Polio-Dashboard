-- ============================================================
-- Logistic Plan + Area Incharge Summary
-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
--
-- ASSUMPTIONS made here (source spreadsheet had conflicting/
-- unclear formulas for these — flagged in the requirement map,
-- proceeding with standard EPI/field-logistics conventions so
-- work isn't blocked; easy to correct once confirmed):
--   - Vitamin A: blue capsule -> children <12 months, red capsule
--     -> children 12-59 months (standard 100,000 IU / 200,000 IU
--     split by age band).
--   - 1 vaccine carrier + 4 ice packs per team per campaign day
--     (standard field kit).
--   - 1 DDM card and 1 tally sheet per team per campaign day.
-- ============================================================

create view logistic_plan as
select
  tdp.*,
  coalesce(hh.children_under_12m, 0) as household_children_under_12m,
  coalesce(hh.children_12_59m, 0) as household_children_12_59m,
  coalesce(hh.children_under_12m, 0) as blue_capsules_needed,
  coalesce(hh.children_12_59m, 0) as red_capsules_needed,
  1 as vaccine_carriers_needed,
  4 as ice_packs_needed,
  1 as ddm_cards_needed,
  1 as tally_sheets_needed
from team_day_plan tdp
left join (
  select campaign_id, team_no, campaign_day,
    sum(children_under_12m) as children_under_12m,
    sum(children_12_59m) as children_12_59m
  from households
  group by campaign_id, team_no, campaign_day
) hh on hh.campaign_id = tdp.campaign_id and hh.team_no = tdp.team_no and hh.campaign_day = tdp.campaign_day;

alter view logistic_plan set (security_invoker = true);

create view area_incharge_summary as
select
  campaign_id,
  count(*) as team_day_plans,
  count(distinct team_no) as teams_covered,
  sum(school_children) as total_school_children,
  sum(household_children) as total_household_children,
  sum(total_children) as grand_total_children,
  round(sum(vaccine_needed), 2) as grand_vaccine_needed,
  sum(target_households) as grand_target_households
from team_day_plan
group by campaign_id;

alter view area_incharge_summary set (security_invoker = true);

create view missed_children_status as
select
  campaign_id,
  count(*) filter (where covered_this_round = false) as still_missed,
  count(*) filter (where covered_this_round = true) as covered,
  count(*) as total_recorded
from missed_children
group by campaign_id;

alter view missed_children_status set (security_invoker = true);
