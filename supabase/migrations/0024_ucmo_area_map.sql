-- UCMO Area Map: one map picture per UCMO (union-council level), stored in the existing staff-documents bucket.
-- Additive only: relaxes the area_map check from "AIC only" to "AIC or UCMO"; AIC behaviour is unchanged.
alter table staff drop constraint if exists staff_area_map_check;
alter table staff add constraint staff_area_map_check check (designation in ('aic','ucmo') or area_map_path is null);

create or replace function set_ucmo_area_map(p_ucmo uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare s staff%rowtype;
begin
  select * into s from staff where id = p_ucmo and designation = 'ucmo';
  if not found then raise exception 'UCMO not found'; end if;
  if s.uc_id not in (select user_scope_uc_ids()) then raise exception 'Not allowed'; end if;
  if not (plan_manager() or (app_user_role() = 'ucmo' and p_ucmo = my_staff_id())) then raise exception 'Not allowed'; end if;
  update staff set area_map_path = p_path where id = p_ucmo;
end $$;
revoke all on function set_ucmo_area_map(uuid,text) from public, anon;
grant execute on function set_ucmo_area_map(uuid,text) to authenticated;
