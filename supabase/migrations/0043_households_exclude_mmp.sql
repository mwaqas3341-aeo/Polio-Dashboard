-- MMP (migrant / mobile population) houses are no longer added to the household target.
-- Only the one expression of the team_plan view changes: computed_households = household houses only. All columns keep their names and order.
-- MMP children stay in their own column (computed_mmp_children / target_mmp_children). Nothing is deleted; stored targets are not rewritten.
create or replace view team_plan as
select
  tt.campaign_id, tt.team_no, tt.campaign_day,
  tt.target_school_children, tt.target_household_children, tt.target_mmp_children, tt.target_children, tt.target_households,
  round(tt.target_children * 1.11, 2) as vaccine_needed,
  coalesce(tdp.school_children, 0) as computed_school_children,
  coalesce(tdp.household_children, 0) as computed_household_children,
  coalesce(tdp.mmp_children, 0) as computed_mmp_children,
  coalesce(tdp.total_children, 0) as computed_total_children,
  coalesce(tdp.household_houses, 0) as computed_households
from team_targets tt
left join team_day_plan tdp
  on tdp.campaign_id = tt.campaign_id and tdp.team_no = tt.team_no and tdp.campaign_day = tt.campaign_day;
alter view team_plan set (security_invoker = true);
