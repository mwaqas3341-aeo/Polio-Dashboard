-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-10 (as partial_data_allowed); verified in a rolled-back transaction.
-- 1. A person can be placed on a team before CNIC pictures / expiry exist (they show as "incomplete", nothing is blocked).
-- 2. Operational-plan household / children figures are NULL until answered, so a real zero is different from "not entered".
--    (final submission still requires them, the village name, both family-head names, 3 pictures, the day map and the AIC area map)
-- team_members_guard() and operational_plans_biu() were re-created accordingly; see the live definitions.
alter table operational_plans alter column total_households drop not null, alter column total_households drop default;
alter table operational_plans alter column children_households_1_5 drop not null, alter column children_households_1_5 drop default;
alter table operational_plans alter column children_under_1 drop not null, alter column children_under_1 drop default;
