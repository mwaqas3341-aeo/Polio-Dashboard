-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-10 (as operational_plan); verified there with rolled-back test data.
-- plan pictures, trigger-maintained totals/doses, and the mandatory Missed Children step before a campaign can be closed.
-- Source formats: During_Polio_April_2026.xlsx ('Operational Plan', 'Team Micro Plan Summaries'),
-- MMP_Coverage_plan.xlsx, School_Student_list_Polio.xlsx, STILL_MISSED_CHILDREN_LAST_COMPAIGN.xlsx.

-- ---------- 1. AIC Area Map (permanent, linked to the AIC) ----------
alter table staff add column if not exists area_map_path text;
alter table staff drop constraint if exists staff_area_map_check;
alter table staff add constraint staff_area_map_check check (designation = 'aic' or area_map_path is null);

-- ---------- 2. storage bucket for plan pictures and day maps ----------
insert into storage.buckets (id, name, public) values ('operational-plans', 'operational-plans', false) on conflict (id) do nothing;
drop policy if exists op_files_select on storage.objects; drop policy if exists op_files_insert on storage.objects;
drop policy if exists op_files_update on storage.objects; drop policy if exists op_files_delete on storage.objects;
create policy op_files_select on storage.objects for select using (bucket_id = 'operational-plans' and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids()));
create policy op_files_insert on storage.objects for insert with check (bucket_id = 'operational-plans' and can_enter_data() and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids()));
create policy op_files_update on storage.objects for update using (bucket_id = 'operational-plans' and can_enter_data() and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids()));
create policy op_files_delete on storage.objects for delete using (bucket_id = 'operational-plans' and can_enter_data() and (storage.foldername(name))[1]::uuid in (select user_scope_uc_ids()));

-- ---------- 3. visibility helper: AIC sees/edits only their own teams ----------
create or replace function plan_team_visible(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams t where t.id = p_team and t.uc_id in (select user_scope_uc_ids())
                 and (app_user_role() <> 'aic' or t.aic_staff_id = my_staff_id()));
$$;
create or replace function plan_manager() returns boolean language sql stable set search_path = public as $$
  select app_user_role() in ('admin','district_coordinator','ucmo');
$$;

-- ---------- 4. operational plan (one row per campaign x mobile team x day) ----------
create table if not exists operational_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_id uuid not null references teams(id),
  campaign_day int not null check (campaign_day between 1 and 3),
  village_area text,                         -- گاوں / علاقہ کا نام
  community_vaccination_place text,          -- کمیونیٹی ویکسینیشن کی جگہ
  team_group text check (team_group in ('G1','G2','G3')),   -- G1/G2/G3
  working_order text,                        -- ٹیم کے کام کرنے کی ترتیب (نقشہ کے حساب سے)
  head_first_family text,                    -- پہلے گھر کے سربراہ کا نام
  head_last_family text,                     -- آخری گھر کے سربراہ کا نام
  total_households int not null default 0 check (total_households >= 0),             -- کل گھرانے
  children_households_1_5 int not null default 0 check (children_households_1_5 >= 0), -- گھروں کے بچے 1 تا 5 سال
  children_under_1 int not null default 0 check (children_under_1 >= 0),             -- 1 سال سے کم
  -- maintained by trigger, never typed in:
  school_children int not null default 0,    -- سکول / مدرسہ کے بچے (sum of the school list)
  mmp_children int not null default 0,       -- MMP (sum of the MMP list)
  total_children int not null default 0,     -- 5 سال سے کم عمر بچوں کی کل تعداد
  required_doses numeric(10,2) not null default 0,  -- پولیو ویکسین خوراکیں = total_children x 1.11
  status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz, submitted_by uuid,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, team_id, campaign_day)
);
create index if not exists op_plans_campaign_idx on operational_plans (campaign_id, campaign_day);
create index if not exists op_plans_team_idx on operational_plans (team_id);

create table if not exists operational_plan_pictures (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references operational_plans(id) on delete cascade,
  slot int not null check (slot between 1 and 5),
  storage_path text not null,
  uploaded_by uuid default auth.uid(), uploaded_at timestamptz not null default now(),
  unique (plan_id, slot)
);

create table if not exists operational_day_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  aic_staff_id uuid not null references staff(id),
  campaign_day int not null check (campaign_day between 1 and 3),
  storage_path text not null,
  uploaded_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (campaign_id, aic_staff_id, campaign_day)
);

-- ---------- 5. triggers ----------
create or replace function plan_children_totals(p_campaign uuid, p_team uuid, p_day int, out o_school int, out o_mmp int)
language plpgsql stable security definer set search_path = public as $$
declare tno int;
begin
  select team_no into tno from teams where id = p_team;
  select coalesce(sum(target_children), 0) into o_school from school_assignments where campaign_id = p_campaign and team_no = tno and campaign_day = p_day;
  select coalesce(sum(child_count), 0) into o_mmp from mmp_assignments where campaign_id = p_campaign and team_no = tno and campaign_day = p_day;
end $$;

create or replace function operational_plans_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; c campaigns%rowtype; n_pics int; a_map text; has_map boolean;
begin
  select * into t from teams where id = new.team_id;
  select * into c from campaigns where id = new.campaign_id;
  if t.team_type <> 'mobile' then raise exception 'The Operational Plan is only for Mobile Teams (Team % is %)', t.team_no, t.team_type; end if;
  if c.uc_id is not null and t.uc_id <> c.uc_id then raise exception 'This team does not belong to the campaign''s union council'; end if;
  if c.status = 'closed' and tg_op = 'INSERT' then raise exception 'The campaign is closed'; end if;
  if tg_op = 'UPDATE' then
    if old.campaign_id <> new.campaign_id or old.team_id <> new.team_id or old.campaign_day <> new.campaign_day then raise exception 'Campaign, team and day of a plan cannot be changed'; end if;
    if old.status = 'submitted' and not plan_manager() and auth.uid() is not null then
      raise exception 'This plan is already submitted. Ask your UCMO or administrator to reopen it.';
    end if;
  end if;
  -- derived numbers: always recomputed, whatever the client sent
  select o_school, o_mmp into new.school_children, new.mmp_children from plan_children_totals(new.campaign_id, new.team_id, new.campaign_day);
  new.total_children := new.children_households_1_5 + new.children_under_1 + new.school_children;
  new.required_doses := round(new.total_children * 1.11, 2);
  new.updated_at := now();
  -- final submission checks
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    if coalesce(trim(new.village_area), '') = '' then raise exception 'Village / area name is required'; end if;
    if coalesce(trim(new.head_first_family), '') = '' then raise exception 'Name of Head of 1st Family is required'; end if;
    if coalesce(trim(new.head_last_family), '') = '' then raise exception 'Name of Head of Last Family is required'; end if;
    if tg_op = 'INSERT' then raise exception 'Save the plan and add its pictures before submitting'; end if;
    select count(*) into n_pics from operational_plan_pictures where plan_id = new.id;
    if n_pics < 3 then raise exception 'At least 3 pictures of the Operational Plan are required (% uploaded)', n_pics; end if;
    if not exists (select 1 from operational_day_maps where campaign_id = new.campaign_id and aic_staff_id = t.aic_staff_id and campaign_day = new.campaign_day) then
      raise exception 'The Day % map has not been uploaded', new.campaign_day;
    end if;
    select area_map_path into a_map from staff where id = t.aic_staff_id;
    if a_map is null then raise exception 'The Area Incharge''s Area Map has not been uploaded yet'; end if;
    new.submitted_at := now(); new.submitted_by := auth.uid();
  end if;
  if new.status = 'draft' and tg_op = 'UPDATE' and old.status = 'submitted' then new.submitted_at := null; new.submitted_by := null; end if;
  return new;
end $$;
drop trigger if exists operational_plans_biu_trg on operational_plans;
create trigger operational_plans_biu_trg before insert or update on operational_plans for each row execute function operational_plans_biu();

-- editing the school list or MMP list refreshes the plan's totals, and is locked once the plan is submitted
create or replace function plan_lists_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; tno int; tid uuid; locked boolean;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select t.id into tid from teams t join campaigns c on c.uc_id = t.uc_id where c.id = r.campaign_id and t.team_no = r.team_no limit 1;
  if tid is not null then
    select (status = 'submitted') into locked from operational_plans where campaign_id = r.campaign_id and team_id = tid and campaign_day = r.campaign_day;
    if coalesce(locked, false) and not plan_manager() and auth.uid() is not null then
      raise exception 'The Operational Plan for Team % Day % is already submitted; ask your UCMO to reopen it', r.team_no, r.campaign_day;
    end if;
  end if;
  return r;
end $$;
create or replace function plan_lists_refresh() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; tid uuid;
begin
  for r in select * from (values (case when tg_op <> 'INSERT' then old.campaign_id end, case when tg_op <> 'INSERT' then old.team_no end, case when tg_op <> 'INSERT' then old.campaign_day end),
                                 (case when tg_op <> 'DELETE' then new.campaign_id end, case when tg_op <> 'DELETE' then new.team_no end, case when tg_op <> 'DELETE' then new.campaign_day end)) v(cid, tno, d)
           where v.cid is not null loop
    select t.id into tid from teams t join campaigns c on c.uc_id = t.uc_id where c.id = r.cid and t.team_no = r.tno limit 1;
    if tid is not null then update operational_plans set updated_at = now() where campaign_id = r.cid and team_id = tid and campaign_day = r.d; end if;
  end loop;
  return null;
end $$;
drop trigger if exists school_assign_plan_guard on school_assignments; drop trigger if exists school_assign_plan_refresh on school_assignments;
drop trigger if exists mmp_assign_plan_guard on mmp_assignments;       drop trigger if exists mmp_assign_plan_refresh on mmp_assignments;
create trigger school_assign_plan_guard before insert or update or delete on school_assignments for each row execute function plan_lists_guard();
create trigger school_assign_plan_refresh after insert or update or delete on school_assignments for each row execute function plan_lists_refresh();
create trigger mmp_assign_plan_guard before insert or update or delete on mmp_assignments for each row execute function plan_lists_guard();
create trigger mmp_assign_plan_refresh after insert or update or delete on mmp_assignments for each row execute function plan_lists_refresh();

create or replace function plan_pictures_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.plan_id, old.plan_id);
begin
  if exists (select 1 from operational_plans where id = pid and status = 'submitted') and not plan_manager() and auth.uid() is not null then
    raise exception 'The plan is already submitted; ask your UCMO to reopen it to change pictures';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists plan_pictures_guard_trg on operational_plan_pictures;
create trigger plan_pictures_guard_trg before insert or update or delete on operational_plan_pictures for each row execute function plan_pictures_guard();

-- ---------- 6. RLS ----------
alter table operational_plans enable row level security; alter table operational_plan_pictures enable row level security; alter table operational_day_maps enable row level security;
drop policy if exists op_plans_select on operational_plans; drop policy if exists op_plans_insert on operational_plans; drop policy if exists op_plans_update on operational_plans; drop policy if exists op_plans_delete on operational_plans;
create policy op_plans_select on operational_plans for select using (plan_team_visible(team_id));
create policy op_plans_insert on operational_plans for insert with check (can_enter_data() and plan_team_visible(team_id));
create policy op_plans_update on operational_plans for update using (can_enter_data() and plan_team_visible(team_id)) with check (can_enter_data() and plan_team_visible(team_id));
create policy op_plans_delete on operational_plans for delete using (plan_manager() and plan_team_visible(team_id));
drop policy if exists op_pics_select on operational_plan_pictures; drop policy if exists op_pics_write on operational_plan_pictures;
create policy op_pics_select on operational_plan_pictures for select using (exists (select 1 from operational_plans p where p.id = plan_id and plan_team_visible(p.team_id)));
create policy op_pics_write on operational_plan_pictures for all using (can_enter_data() and exists (select 1 from operational_plans p where p.id = plan_id and plan_team_visible(p.team_id)))
  with check (can_enter_data() and exists (select 1 from operational_plans p where p.id = plan_id and plan_team_visible(p.team_id)));
drop policy if exists op_maps_select on operational_day_maps; drop policy if exists op_maps_write on operational_day_maps;
create policy op_maps_select on operational_day_maps for select using (exists (select 1 from staff s where s.id = operational_day_maps.aic_staff_id and s.uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or s.id = my_staff_id())));
create policy op_maps_write on operational_day_maps for all using (can_enter_data() and exists (select 1 from staff s where s.id = operational_day_maps.aic_staff_id and s.uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or s.id = my_staff_id())))
  with check (can_enter_data() and exists (select 1 from staff s where s.id = operational_day_maps.aic_staff_id and s.uc_id in (select user_scope_uc_ids()) and (app_user_role() <> 'aic' or s.id = my_staff_id())));

-- audit trail like the other operational tables
drop trigger if exists operational_plans_audit on operational_plans;
create trigger operational_plans_audit after insert or update or delete on operational_plans for each row execute function audit_trigger_fn();

-- ---------- 7. campaign completion: Missed Children is mandatory before final closure ----------
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'campaigns'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%catchup%';
  if c is not null then execute format('alter table campaigns drop constraint %I', c); end if;
end $$;
alter table campaigns add constraint campaigns_status_check check (status in ('planning','active','catchup','completed','closed'));
alter table campaigns add column if not exists missed_children_status text not null default 'pending' check (missed_children_status in ('pending','submitted','none_reported'));
alter table campaigns add column if not exists missed_children_note text;
alter table campaigns add column if not exists missed_children_at timestamptz;
alter table campaigns add column if not exists missed_children_by uuid;

create or replace function campaign_closure_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' and new.missed_children_status = 'pending' then
    raise exception 'Missed Children Report: PENDING. Enter the missed children (or state that none were missed) before the campaign can be closed.';
  end if;
  return new;
end $$;
drop trigger if exists campaign_closure_guard_trg on campaigns;
create trigger campaign_closure_guard_trg before update of status on campaigns for each row execute function campaign_closure_guard();

create or replace function submit_missed_children_report(p_campaign uuid, p_mode text, p_note text default null) returns void
language plpgsql set search_path = public as $$
declare n int;
begin
  if not can_enter_data() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from campaigns c where c.id = p_campaign and (c.uc_id is null or c.uc_id in (select user_scope_uc_ids()))) then raise exception 'Campaign not found'; end if;
  if p_mode = 'submitted' then
    select count(*) into n from missed_children where campaign_id = p_campaign;
    if n = 0 then raise exception 'No missed children have been entered for this campaign. Enter them, or choose "No children were missed".'; end if;
  elsif p_mode = 'none_reported' then
    if length(trim(coalesce(p_note, ''))) < 10 then raise exception 'Please write a short note confirming that no children were missed (at least 10 characters)'; end if;
  else raise exception 'Unknown mode %', p_mode; end if;
  update campaigns set missed_children_status = p_mode, missed_children_note = nullif(trim(coalesce(p_note, '')), ''), missed_children_at = now(), missed_children_by = auth.uid() where id = p_campaign;
end $$;
revoke all on function submit_missed_children_report(uuid,text,text) from public, anon;
grant execute on function submit_missed_children_report(uuid,text,text) to authenticated;

-- ---------- 8. AIC Area Map: set / replace (UCMO, administrator, or the AIC for their own map only) ----------
create or replace function set_aic_area_map(p_aic uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare s staff%rowtype;
begin
  select * into s from staff where id = p_aic and designation = 'aic';
  if not found then raise exception 'Area Incharge not found'; end if;
  if s.uc_id not in (select user_scope_uc_ids()) then raise exception 'Not allowed'; end if;
  if not (plan_manager() or (app_user_role() = 'aic' and p_aic = my_staff_id())) then raise exception 'Not allowed'; end if;
  update staff set area_map_path = p_path where id = p_aic;
end $$;
revoke all on function set_aic_area_map(uuid,text) from public, anon;
grant execute on function set_aic_area_map(uuid,text) to authenticated;
