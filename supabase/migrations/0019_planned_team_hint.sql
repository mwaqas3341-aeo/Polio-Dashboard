-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-07 (as planned_team_hint).
-- Remembers the team a person is expected to join (from the previous allotment sheet) so they can be placed with one click
-- once their CNIC pictures and expiry date are entered.
alter table staff add column if not exists planned_team_no int;
alter table staff add column if not exists planned_member_no int;
alter table staff drop constraint if exists staff_planned_team_check;
alter table staff add constraint staff_planned_team_check check (
  (designation = 'team_member' or (planned_team_no is null and planned_member_no is null))
  and (planned_team_no is null or planned_team_no between 1 and 999)
  and (planned_member_no is null or planned_member_no in (1, 2)));
