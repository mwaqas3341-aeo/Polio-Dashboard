-- Purely additive. Nothing existing is dropped, renamed or rewritten, and no existing rows are touched.
--
-- 1. UCMO Area Map: the existing check only let an Area Incharge hold an area map. It is widened (a superset, so every existing row
--    still satisfies it) so the UCMO can hold one too. Stored exactly like the AIC map: staff.area_map_path -> private
--    "staff-documents" bucket at {uc_id}/{staff_id}/area-map.<ext>, which the existing storage policies already scope by UC.
-- 2. team_day_maps: one separate map picture per TEAM per campaign DAY (days 1-3). Stored in the private "operational-plans" bucket at
--    {uc_id}/{campaign_id}/team-maps/{team_id}/day{N}.<ext> (existing storage policies already scope that bucket by UC).
--    The older per-AIC operational_day_maps table and the AIC Area Map are left exactly as they are.

-- ---------- 1. UCMO area map ----------
alter table staff drop constraint if exists staff_area_map_check;
alter table staff add constraint staff_area_map_check check (designation in ('aic', 'ucmo') or area_map_path is null);

create or replace function set_ucmo_area_map(p_ucmo uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare s staff%rowtype;
begin
  select * into s from staff where id = p_ucmo and designation = 'ucmo';
  if not found then raise exception 'UCMO not found'; end if;
  if s.uc_id not in (select user_scope_uc_ids()) then raise exception 'Not allowed'; end if;
  if not plan_manager() then raise exception 'Not allowed'; end if;     -- UCMO, district coordinator or administrator
  update staff set area_map_path = p_path where id = p_ucmo;
end $$;
revoke all on function set_ucmo_area_map(uuid, text) from public, anon;
grant execute on function set_ucmo_area_map(uuid, text) to authenticated;

-- ---------- 2. team day maps ----------
create table if not exists team_day_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_id uuid not null references teams(id),
  campaign_day int not null check (campaign_day between 1 and 3),
  storage_path text not null,
  uploaded_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, team_id, campaign_day)
);
create index if not exists team_day_maps_team_idx on team_day_maps (team_id);

alter table team_day_maps enable row level security;
drop policy if exists team_maps_select on team_day_maps;
drop policy if exists team_maps_insert on team_day_maps;
drop policy if exists team_maps_update on team_day_maps;
drop policy if exists team_maps_delete on team_day_maps;
-- same visibility rule as operational_plans: your UC, and an AIC sees only their own teams
create policy team_maps_select on team_day_maps for select using (plan_team_visible(team_id));
create policy team_maps_insert on team_day_maps for insert with check (can_enter_data() and plan_team_visible(team_id));
create policy team_maps_update on team_day_maps for update using (can_enter_data() and plan_team_visible(team_id)) with check (can_enter_data() and plan_team_visible(team_id));
create policy team_maps_delete on team_day_maps for delete using (can_enter_data() and plan_team_visible(team_id));

drop trigger if exists team_day_maps_audit on team_day_maps;
create trigger team_day_maps_audit after insert or update or delete on team_day_maps for each row execute function audit_trigger_fn();
