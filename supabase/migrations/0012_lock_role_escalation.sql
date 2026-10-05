-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-05. Closes self-service admin role escalation.
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (
  app_user_role() = 'admin'
  or (id = auth.uid() and role in ('aic','encoder','viewer'))
);

create or replace function profiles_guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if app_user_role() is distinct from 'admin' and auth.uid() is not null then
    if new.role is distinct from old.role
       or new.uc_id is distinct from old.uc_id
       or new.district_id is distinct from old.district_id
       or new.tehsil_id is distinct from old.tehsil_id then
      raise exception 'Only an admin can change role or area scope';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role_trg on profiles;
create trigger profiles_guard_role_trg before update on profiles
  for each row execute function profiles_guard_role();

-- Admin bootstrap (run once, by hand, in the Supabase SQL editor — NOT committed with a real CNIC):
--   1. Dashboard → Authentication → Users → Add user:
--        email   = <13-digit CNIC>@cnic.polio.local
--        password= a STRONG password (auto-confirm the user)
--   2. Then: insert into profiles (id, full_name, role)
--            select id, 'Muhammad Waqas', 'admin' from auth.users
--            where email = '<13-digit CNIC>@cnic.polio.local';
