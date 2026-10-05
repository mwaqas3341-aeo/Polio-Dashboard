-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-05.
-- Team types are exactly: fixed, transit, mobile (was 'mobile_cbv').
alter table teams drop constraint if exists teams_team_type_check;
update teams set team_type = 'mobile' where team_type = 'mobile_cbv';
alter table teams add constraint teams_team_type_check check (team_type in ('fixed','transit','mobile'));
update staff_adjustment_history set from_team_type = 'mobile' where from_team_type = 'mobile_cbv';
update staff_adjustment_history set to_team_type = 'mobile' where to_team_type = 'mobile_cbv';
