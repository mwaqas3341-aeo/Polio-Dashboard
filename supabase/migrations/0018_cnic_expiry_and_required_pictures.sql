-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-07.
alter table staff add column if not exists cnic_expiry date;
alter table staff add column if not exists cnic_lifetime boolean not null default false;
alter table staff drop constraint if exists staff_cnic_expiry_check;
alter table staff add constraint staff_cnic_expiry_check check (not cnic_lifetime or cnic_expiry is null);

create or replace function team_members_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s staff%rowtype; t teams%rowtype; n int;
begin
  if not new.active then return new; end if;
  select * into s from staff where id = new.staff_id;
  select * into t from teams where id = new.team_id;
  if s.designation is distinct from 'team_member' then raise exception 'Only staff with designation Team Member can be placed on a team'; end if;
  if s.status <> 'active' then raise exception 'Inactive staff cannot be placed on a team'; end if;
  if s.cnic_pic_front_path is null or s.cnic_pic_back_path is null then
    raise exception 'CNIC front and back pictures are required before a person can join a team';
  end if;
  if not s.cnic_lifetime and (s.cnic_expiry is null or s.cnic_expiry < current_date) then
    raise exception 'A valid (not expired) CNIC expiry date is required before a person can join a team';
  end if;
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
