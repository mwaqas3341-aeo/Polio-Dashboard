-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-10 (as staff_official_details).
-- Original designation, department and place of posting (from the "AICs & Line Department" detail sheet).
alter table staff add column if not exists official_designation text;
alter table staff add column if not exists department text;
alter table staff add column if not exists place_of_posting text;
