-- ============================================================
-- Role- and UC-scoped Row Level Security
-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
--   admin               -> everything, everywhere
--   district_coordinator-> everything within their district (profiles.district_id)
--   aic                 -> read/write within their own UC (profiles.uc_id)
--   encoder             -> read + operational-data write within their own UC
--   viewer              -> read-only within their own UC
-- ============================================================

alter table profiles add column if not exists district_id uuid references districts(id);
alter table profiles add column if not exists tehsil_id uuid references tehsils(id);

create or replace function app_user_role() returns text
language sql stable as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function user_scope_uc_ids() returns setof uuid
language plpgsql stable as $$
declare
  r record;
begin
  select role, uc_id, district_id into r from profiles where id = auth.uid();
  if r.role is null then
    return;
  elsif r.role = 'admin' then
    return query select id from union_councils;
  elsif r.role = 'district_coordinator' then
    return query
      select uc.id from union_councils uc
      join tehsils t on t.id = uc.tehsil_id
      where t.district_id = r.district_id;
  else
    return query select r.uc_id where r.uc_id is not null;
  end if;
end;
$$;

create or replace function can_manage() returns boolean
language sql stable as $$
  select app_user_role() in ('admin','district_coordinator','aic');
$$;

create or replace function can_enter_data() returns boolean
language sql stable as $$
  select app_user_role() in ('admin','district_coordinator','aic','encoder');
$$;

-- ---------- Drop the blanket "any authenticated user" policies ----------
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'staff','teams','team_members','campaigns','campaign_teams','schools',
    'school_assignments','mmp_contacts','mmp_assignments','households',
    'missed_children','daily_reports','supervision_visits','ddm_cards','audit_log',
    'districts','tehsils','union_councils','profiles'
  ])
  loop
    execute format('drop policy if exists %I on %I', tbl || '_select_auth', tbl);
    execute format('drop policy if exists %I on %I', tbl || '_insert_auth', tbl);
    execute format('drop policy if exists %I on %I', tbl || '_update_auth', tbl);
    execute format('drop policy if exists %I on %I', tbl || '_delete_auth', tbl);
  end loop;
end $$;

-- ---------- Geography: open read, admin-only write on existing rows ----------
create policy districts_select on districts for select using (auth.role() = 'authenticated');
create policy districts_insert on districts for insert with check (auth.role() = 'authenticated');
create policy districts_modify on districts for update using (app_user_role() = 'admin');
create policy districts_delete on districts for delete using (app_user_role() = 'admin');

create policy tehsils_select on tehsils for select using (auth.role() = 'authenticated');
create policy tehsils_insert on tehsils for insert with check (auth.role() = 'authenticated');
create policy tehsils_modify on tehsils for update using (app_user_role() = 'admin');
create policy tehsils_delete on tehsils for delete using (app_user_role() = 'admin');

create policy union_councils_select on union_councils for select using (auth.role() = 'authenticated');
create policy union_councils_insert on union_councils for insert with check (auth.role() = 'authenticated');
create policy union_councils_modify on union_councils for update using (app_user_role() = 'admin');
create policy union_councils_delete on union_councils for delete using (app_user_role() = 'admin');

-- ---------- Profiles ----------
create policy profiles_select on profiles for select using (
  id = auth.uid() or app_user_role() = 'admin' or uc_id in (select user_scope_uc_ids())
);
create policy profiles_insert on profiles for insert with check (
  id = auth.uid() or app_user_role() = 'admin'
);
create policy profiles_update on profiles for update using (
  id = auth.uid() or app_user_role() = 'admin'
);
create policy profiles_delete on profiles for delete using (app_user_role() = 'admin');

-- ---------- UC-scoped master tables (direct uc_id column) ----------
create policy staff_select on staff for select using (uc_id in (select user_scope_uc_ids()));
create policy staff_write on staff for insert with check (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy staff_update on staff for update using (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy staff_delete on staff for delete using (can_manage() and uc_id in (select user_scope_uc_ids()));

create policy teams_select on teams for select using (uc_id in (select user_scope_uc_ids()));
create policy teams_write on teams for insert with check (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy teams_update on teams for update using (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy teams_delete on teams for delete using (can_manage() and uc_id in (select user_scope_uc_ids()));

create policy schools_select on schools for select using (uc_id in (select user_scope_uc_ids()));
create policy schools_write on schools for insert with check (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy schools_update on schools for update using (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy schools_delete on schools for delete using (can_manage() and uc_id in (select user_scope_uc_ids()));

create policy mmp_contacts_select on mmp_contacts for select using (uc_id in (select user_scope_uc_ids()));
create policy mmp_contacts_write on mmp_contacts for insert with check (can_enter_data() and uc_id in (select user_scope_uc_ids()));
create policy mmp_contacts_update on mmp_contacts for update using (can_enter_data() and uc_id in (select user_scope_uc_ids()));
create policy mmp_contacts_delete on mmp_contacts for delete using (can_manage() and uc_id in (select user_scope_uc_ids()));

create policy campaigns_select on campaigns for select using (uc_id in (select user_scope_uc_ids()));
create policy campaigns_write on campaigns for insert with check (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy campaigns_update on campaigns for update using (can_manage() and uc_id in (select user_scope_uc_ids()));
create policy campaigns_delete on campaigns for delete using (can_manage() and uc_id in (select user_scope_uc_ids()));

-- ---------- Team membership (scoped via teams.uc_id) ----------
create policy team_members_select on team_members for select using (
  team_id in (select id from teams where uc_id in (select user_scope_uc_ids()))
);
create policy team_members_write on team_members for insert with check (
  can_manage() and team_id in (select id from teams where uc_id in (select user_scope_uc_ids()))
);
create policy team_members_update on team_members for update using (
  can_manage() and team_id in (select id from teams where uc_id in (select user_scope_uc_ids()))
);
create policy team_members_delete on team_members for delete using (
  can_manage() and team_id in (select id from teams where uc_id in (select user_scope_uc_ids()))
);

-- ---------- Campaign-scoped operational tables (via campaign_id -> campaigns.uc_id) ----------
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'campaign_teams','school_assignments','mmp_assignments','households',
    'missed_children','daily_reports','ddm_cards','supervision_visits'
  ])
  loop
    execute format($f$
      create policy %I on %I for select using (
        campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
      )$f$, tbl || '_select', tbl);
    execute format($f$
      create policy %I on %I for insert with check (
        can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
      )$f$, tbl || '_write', tbl);
    execute format($f$
      create policy %I on %I for update using (
        can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
      )$f$, tbl || '_update', tbl);
    execute format($f$
      create policy %I on %I for delete using (
        can_manage() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids()))
      )$f$, tbl || '_delete', tbl);
  end loop;
end $$;

-- ---------- Audit log: admin / district_coordinator read-only; no direct writes ----------
create policy audit_log_select on audit_log for select using (
  app_user_role() in ('admin','district_coordinator')
);
-- Intentionally no insert/update/delete policy for app roles: the audit
-- trigger function runs as its (superuser) owner and bypasses RLS, so
-- logging still works even though no user-facing policy grants writes here.
