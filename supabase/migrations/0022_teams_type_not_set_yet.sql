-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-10 (as teams_type_not_set_yet).
-- A team may exist before its type (fixed / transit / mobile) is known; the screen flags it "Type not set"
-- and the Operational Plan still accepts only teams explicitly set to mobile.
alter table teams alter column team_type drop not null;
-- operational_plans_biu() was re-created with:  if t.team_type is distinct from 'mobile' then raise exception ...
-- (see 0020; the only change is NULL-safe comparison)
