-- 1. AIC-scoped access to MMP, school and missed-children records, and to CNIC pictures in storage.
--    Until now these were scoped by union council only, so any Area Incharge could read every team's records in the UC.
--    Non-AIC roles (admin, district coordinator, UCMO, encoder, viewer) behave exactly as before.
create or replace function aic_owns_team(p_campaign uuid, p_team_no int) returns boolean
language sql stable security definer set search_path = public as $$
  select app_user_role() <> 'aic' or exists (
    select 1 from campaigns c join teams t on t.uc_id = c.uc_id and t.team_no = p_team_no
    where c.id = p_campaign and t.aic_staff_id = my_staff_id());
$$;
create or replace function aic_owns_staff_doc(p_object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_user_role() <> 'aic'
      or p_object_name ~ '/area-map\.[A-Za-z]+$'                                   -- area-map pictures are not personal documents
      or exists (select 1 from staff s where s.id::text = (string_to_array(p_object_name, '/'))[2]
                 and (s.id = my_staff_id() or s.aic_staff_id = my_staff_id()));    -- own CNIC, own team members, own drivers
$$;
revoke all on function aic_owns_team(uuid,int), aic_owns_staff_doc(text) from public, anon;
grant execute on function aic_owns_team(uuid,int), aic_owns_staff_doc(text) to authenticated;

-- master lists: who added a record (an AIC keeps seeing what they added before assigning it to a team)
alter table mmp_contacts add column if not exists created_by uuid default auth.uid();
alter table schools add column if not exists created_by uuid default auth.uid();
alter table schools add column if not exists emis_code text;   -- optional; shown in the questionnaire and school list

create or replace function aic_sees_mmp_contact(p_id uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_user_role() <> 'aic' or p_created_by = auth.uid() or exists (
    select 1 from mmp_assignments a join campaigns c on c.id = a.campaign_id
    join teams t on t.uc_id = c.uc_id and t.team_no = a.team_no
    where a.mmp_contact_id = p_id and t.aic_staff_id = my_staff_id());
$$;
create or replace function aic_sees_school(p_id uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app_user_role() <> 'aic' or p_created_by = auth.uid() or exists (
    select 1 from school_assignments a join campaigns c on c.id = a.campaign_id
    join teams t on t.uc_id = c.uc_id and t.team_no = a.team_no
    where a.school_id = p_id and t.aic_staff_id = my_staff_id());
$$;
revoke all on function aic_sees_mmp_contact(uuid,uuid), aic_sees_school(uuid,uuid) from public, anon;
grant execute on function aic_sees_mmp_contact(uuid,uuid), aic_sees_school(uuid,uuid) to authenticated;

-- policies (same rules as before + the AIC condition)
drop policy if exists missed_children_select on missed_children; drop policy if exists missed_children_write on missed_children;
drop policy if exists missed_children_update on missed_children; drop policy if exists missed_children_delete on missed_children;
create policy missed_children_select on missed_children for select using (campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy missed_children_write on missed_children for insert with check (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy missed_children_update on missed_children for update using (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no)) with check (aic_owns_team(campaign_id, team_no));
create policy missed_children_delete on missed_children for delete using (can_manage() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));

drop policy if exists mmp_assignments_select on mmp_assignments; drop policy if exists mmp_assignments_write on mmp_assignments;
drop policy if exists mmp_assignments_update on mmp_assignments; drop policy if exists mmp_assignments_delete on mmp_assignments;
create policy mmp_assignments_select on mmp_assignments for select using (campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy mmp_assignments_write on mmp_assignments for insert with check (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy mmp_assignments_update on mmp_assignments for update using (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no)) with check (aic_owns_team(campaign_id, team_no));
create policy mmp_assignments_delete on mmp_assignments for delete using (can_manage() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));

drop policy if exists school_assignments_select on school_assignments; drop policy if exists school_assignments_write on school_assignments;
drop policy if exists school_assignments_update on school_assignments; drop policy if exists school_assignments_delete on school_assignments;
create policy school_assignments_select on school_assignments for select using (campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy school_assignments_write on school_assignments for insert with check (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy school_assignments_update on school_assignments for update using (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no)) with check (aic_owns_team(campaign_id, team_no));
create policy school_assignments_delete on school_assignments for delete using (can_manage() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));

drop policy if exists mmp_contacts_select on mmp_contacts; drop policy if exists mmp_contacts_update on mmp_contacts; drop policy if exists mmp_contacts_delete on mmp_contacts;
create policy mmp_contacts_select on mmp_contacts for select using (uc_id in (select user_scope_uc_ids()) and aic_sees_mmp_contact(id, created_by));
create policy mmp_contacts_update on mmp_contacts for update using (can_enter_data() and uc_id in (select user_scope_uc_ids()) and aic_sees_mmp_contact(id, created_by));
create policy mmp_contacts_delete on mmp_contacts for delete using (can_manage() and uc_id in (select user_scope_uc_ids()) and aic_sees_mmp_contact(id, created_by));

drop policy if exists schools_select on schools; drop policy if exists schools_update on schools; drop policy if exists schools_delete on schools;
create policy schools_select on schools for select using (uc_id in (select user_scope_uc_ids()) and aic_sees_school(id, created_by));
create policy schools_update on schools for update using (can_manage() and uc_id in (select user_scope_uc_ids()) and aic_sees_school(id, created_by));
create policy schools_delete on schools for delete using (can_manage() and uc_id in (select user_scope_uc_ids()) and aic_sees_school(id, created_by));

-- CNIC pictures: an AIC reads only their own and their own team members' / drivers' documents
drop policy if exists staff_docs_select on storage.objects;
create policy staff_docs_select on storage.objects for select using (
  bucket_id = 'staff-documents' and ((storage.foldername(name))[1])::uuid in (select user_scope_uc_ids()) and aic_owns_staff_doc(name));

-- 2. Actual coverage records (kept apart from the MMP / school master figures, which are never overwritten)
create table if not exists coverage_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mmp','school')),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  mmp_assignment_id uuid references mmp_assignments(id) on delete cascade,
  school_assignment_id uuid references school_assignments(id) on delete cascade,
  campaign_day int not null check (campaign_day >= 1),
  children_covered int not null check (children_covered >= 0),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((kind = 'mmp' and mmp_assignment_id is not null and school_assignment_id is null)
      or (kind = 'school' and school_assignment_id is not null and mmp_assignment_id is null))
);
create unique index if not exists coverage_mmp_day_uidx on coverage_entries (mmp_assignment_id, campaign_day) where kind = 'mmp';
create unique index if not exists coverage_school_day_uidx on coverage_entries (school_assignment_id, campaign_day) where kind = 'school';
create index if not exists coverage_campaign_team_idx on coverage_entries (campaign_id, team_no);

create or replace function coverage_entries_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid; tno int; days int;
begin
  if new.kind = 'mmp' then select campaign_id, team_no into cid, tno from mmp_assignments where id = new.mmp_assignment_id;
  else select campaign_id, team_no into cid, tno from school_assignments where id = new.school_assignment_id; end if;
  if cid is null then raise exception 'The MMP / school record was not found'; end if;
  new.campaign_id := cid; new.team_no := tno;                       -- taken from the master record, never from the client
  select total_days into days from campaigns where id = cid;
  if days is not null and new.campaign_day > days then raise exception 'Campaign day % is outside this campaign (% days)', new.campaign_day, days; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists coverage_entries_biu_trg on coverage_entries;
create trigger coverage_entries_biu_trg before insert or update on coverage_entries for each row execute function coverage_entries_biu();

alter table coverage_entries enable row level security;
create policy coverage_select on coverage_entries for select using (campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy coverage_insert on coverage_entries for insert with check (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create policy coverage_update on coverage_entries for update using (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no)) with check (aic_owns_team(campaign_id, team_no));
create policy coverage_delete on coverage_entries for delete using (can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no));
create trigger coverage_entries_audit after insert or update or delete on coverage_entries for each row execute function audit_trigger_fn();
