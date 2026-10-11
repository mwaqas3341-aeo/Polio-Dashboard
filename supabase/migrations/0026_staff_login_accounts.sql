-- Login accounts for Area Incharges and team members created by a UCMO or administrator.
-- Username = 13-digit CNIC (mapped to <cnic>@cnic.polio.local by the login page); first password = the same CNIC,
-- and the person must choose a new password at first sign-in (must_change_password).
alter table profiles add column if not exists must_change_password boolean not null default false;
create unique index if not exists profiles_staff_id_uidx on profiles (staff_id) where staff_id is not null;

-- team members get their own role; it deliberately has NO area scope (see user_scope_uc_ids below)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','district_coordinator','ucmo','aic','encoder','viewer','team_member'));

create or replace function user_scope_uc_ids() returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select role, uc_id, district_id into r from profiles where id = auth.uid();
  if r.role is null then
    return;
  elsif r.role = 'admin' then
    return query select id from union_councils;
  elsif r.role = 'district_coordinator' then
    return query select uc.id from union_councils uc join tehsils t on t.id = uc.tehsil_id where t.district_id = r.district_id;
  elsif r.role = 'team_member' then
    return;                                   -- team-member logins see no union-council data until a team page is defined for them
  else
    return query select r.uc_id where r.uc_id is not null;
  end if;
end $$;

-- SECURITY: a signed-in user could previously rewrite their own profiles.staff_id and thereby become "another AIC"
-- (my_staff_id() reads it). Only an admin may change it now; the account-provisioning function uses the service role.
create or replace function profiles_guard_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app_user_role() is distinct from 'admin' and auth.uid() is not null then
    if new.role is distinct from old.role or new.uc_id is distinct from old.uc_id or new.district_id is distinct from old.district_id
       or new.tehsil_id is distinct from old.tehsil_id or new.staff_id is distinct from old.staff_id then
      raise exception 'Only an admin can change role, area scope or the linked staff record';
    end if;
  end if;
  return new;
end $$;

create or replace function clear_must_change_password() returns void language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
$$;
revoke all on function clear_must_change_password() from public, anon;
grant execute on function clear_must_change_password() to authenticated;
