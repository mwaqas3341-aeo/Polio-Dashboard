-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Team member numbering (position on the roster, e.g. Member 1, 2, 3…)
alter table team_members add column if not exists member_no int;

-- CNIC front/back photo storage — these are Supabase Storage object paths
-- (in the private "staff-documents" bucket, see 0008), not public URLs.
alter table staff add column if not exists cnic_pic_front_path text;
alter table staff add column if not exists cnic_pic_back_path text;
