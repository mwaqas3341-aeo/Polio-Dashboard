-- Hierarchy: UCMO > Area Incharge (AIC) > Teams (1-2 members each); AICs may keep drivers.
-- Designations: ucmo, aic, team_member, driver.

-- ---- roles / profile link ----
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%role%';
  if c is not null then execute format('alter table profiles drop constraint %I', c); end if;
end $$;
alter table profiles add constraint profiles_role_check
  check (role in ('admin','district_coordinator','ucmo','aic','encoder','viewer'));
alter table profiles add column if not exists staff_id uuid references staff(id) on delete set null;

-- ---- staff ----
alter table staff add column if not exists aic_no int;
alter table staff add column if not exists aic_staff_id uuid references staff(id) on delete set null;
alter table staff add column if not exists can_have_driver boolean not null default false;

alter table staff alter column designation set not null;
alter table staff drop constraint if exists staff_designation_check;
alter table staff add constraint staff_designation_check check (designation in ('ucmo','aic','team_member','driver'));
alter table staff drop constraint if exists staff_aic_no_check;
alter table staff add constraint staff_aic_no_check check ((designation = 'aic') = (aic_no is not null) and (aic_no is null or aic_no between 1 and 99));
alter table staff drop constraint if exists staff_reports_to_check;
alter table staff add constraint staff_reports_to_check check ((designation in ('team_member','driver')) = (aic_staff_id is not null));
alter table staff drop constraint if exists staff_cnic_format_check;
alter table staff add constraint staff_cnic_format_check check (cnic is not null and cnic ~ '^[0-9]{5}-[0-9]{7}-[0-9]$');
alter table staff drop constraint if exists staff_phone_format_check;
alter table staff add constraint staff_phone_format_check check (phone is not null and phone ~ '^03[0-9]{2}-[0-9]{7}$');
create unique index if not exists staff_aic_no_uniq on staff (uc_id, aic_no) where designation = 'aic';
create unique index if not exists staff_one_ucmo_per_uc on staff (uc_id) where designation = 'ucmo' and status = 'active';

-- ---- teams ----
alter table teams add column if not exists aic_staff_id uuid references staff(id) on delete restrict;

-- ---- team_members ----
alter table team_members alter column member_no set not null;
alter table team_members drop constraint if exists team_members_member_no_check;
alter table team_members add constraint team_members_member_no_check check (member_no between 1 and 2);
create unique index if not exists team_members_active_slot on team_members (team_id, member_no) where active;
create unique index if not exists team_members_active_person on team_members (staff_id) where active;

-- ---- helper functions ----
create or replace function my_staff_id() returns uuid language sql stable security definer set search_path = public as $$
  select staff_id from profiles where id = auth.uid();
$$;
create or replace function can_manage() returns boolean language sql stable set search_path = public as $$
  select app_user_role() in ('admin','district_coordinator','ucmo','aic');
$$;
create or replace function can_enter_data() returns boolean language sql stable set search_path = public as $$
  select app_user_role() in ('admin','district_coordinator','ucmo','aic','encoder');
$$;

-- ---- integrity triggers ----
create or replace function staff_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare a staff%rowtype;
begin
  if new.designation in ('team_member','driver') then
    select * into a from staff where id = new.aic_staff_id;
    if not found or a.designation <> 'aic' then raise exception 'Reports-to must be an Area Incharge'; end if;
    if a.uc_id is distinct from new.uc_id then raise exception 'Area Incharge belongs to a different union council'; end if;
    if new.designation = 'driver' and not a.can_have_driver then
      raise exception 'This Area Incharge is not allowed to keep a driver';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists staff_guard_trg on staff;
create trigger staff_guard_trg before insert or update on staff for each row execute function staff_guard();

create or replace function staff_deactivate_cascade() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'inactive' and old.status = 'active' then
    update team_members set active = false, ended_on = current_date, end_reason = 'Staff deactivated'
      where staff_id = new.id and active;
  end if;
  return new;
end $$;
drop trigger if exists staff_deactivate_trg on staff;
create trigger staff_deactivate_trg after update on staff for each row execute function staff_deactivate_cascade();

create or replace function team_members_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s staff%rowtype; t teams%rowtype; n int;
begin
  if not new.active then return new; end if;
  select * into s from staff where id = new.staff_id;
  select * into t from teams where id = new.team_id;
  if s.designation is distinct from 'team_member' then raise exception 'Only staff with designation Team Member can be placed on a team'; end if;
  if s.status <> 'active' then raise exception 'Inactive staff cannot be placed on a team'; end if;
  if t.aic_staff_id is null then raise exception 'This team has no Area Incharge assigned'; end if;
  select count(*) into n from team_members where team_id = new.team_id and active and id is distinct from new.id;
  if n >= 2 then raise exception 'A team can have at most 2 members'; end if;
  if exists (select 1 from team_members where staff_id = new.staff_id and active and id is distinct from new.id) then
    raise exception 'This person is already an active member of another team';
  end if;
  if s.aic_staff_id is distinct from t.aic_staff_id then
    update staff set aic_staff_id = t.aic_staff_id where id = s.id;
  end if;
  return new;
end $$;
drop trigger if exists team_members_guard_trg on team_members;
create trigger team_members_guard_trg before insert or update on team_members for each row execute function team_members_guard();

-- ---- RLS: UCMO/admin/coordinator manage everything in scope; an AIC only their own staff, teams and members ----
drop policy if exists staff_select on staff; drop policy if exists staff_write on staff;
drop policy if exists staff_update on staff; drop policy if exists staff_delete on staff;
create policy staff_select on staff for select using (
  uc_id in (select user_scope_uc_ids())
  and (app_user_role() <> 'aic' or id = my_staff_id() or aic_staff_id = my_staff_id()));
create policy staff_write on staff for insert with check (
  can_manage() and uc_id in (select user_scope_uc_ids())
  and (app_user_role() <> 'aic' or (designation in ('team_member','driver') and aic_staff_id = my_staff_id())));
create policy staff_update on staff for update
  using (can_manage() and uc_id in (select user_scope_uc_ids())
         and (app_user_role() <> 'aic' or (designation in ('team_member','driver') and aic_staff_id = my_staff_id())))
  with check (can_manage() and uc_id in (select user_scope_uc_ids())
         and (app_user_role() <> 'aic' or (designation in ('team_member','driver') and aic_staff_id = my_staff_id())));
create policy staff_delete on staff for delete using (
  app_user_role() in ('admin','district_coordinator','ucmo') and uc_id in (select user_scope_uc_ids()));

drop policy if exists teams_select on teams; drop policy if exists teams_write on teams;
drop policy if exists teams_update on teams; drop policy if exists teams_delete on teams;
create policy teams_select on teams for select using (
  uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or aic_staff_id = my_staff_id()));
create policy teams_write on teams for insert with check (
  can_manage() and uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or aic_staff_id = my_staff_id()));
create policy teams_update on teams for update
  using (can_manage() and uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or aic_staff_id = my_staff_id()))
  with check (can_manage() and uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or aic_staff_id = my_staff_id()));
create policy teams_delete on teams for delete using (
  app_user_role() in ('admin','district_coordinator','ucmo') and uc_id in (select user_scope_uc_ids()));

drop policy if exists team_members_select on team_members; drop policy if exists team_members_write on team_members;
drop policy if exists team_members_update on team_members; drop policy if exists team_members_delete on team_members;
create policy team_members_select on team_members for select using (team_id in (select id from teams));
create policy team_members_write on team_members for insert with check (can_manage() and team_id in (select id from teams));
create policy team_members_update on team_members for update using (can_manage() and team_id in (select id from teams))
  with check (can_manage() and team_id in (select id from teams));
create policy team_members_delete on team_members for delete using (can_manage() and team_id in (select id from teams));
