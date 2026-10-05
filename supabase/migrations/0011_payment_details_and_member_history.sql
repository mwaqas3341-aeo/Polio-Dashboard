-- NOT YET APPLIED — Supabase connection timed out when this was written (2026-10-05).
-- Payment account details per staff member (for payment lists, downloaded separately)
alter table staff add column if not exists payment_number text;
alter table staff add column if not exists payment_wallet text;
alter table staff add column if not exists iban text;

alter table staff drop constraint if exists staff_payment_wallet_check;
alter table staff add constraint staff_payment_wallet_check
  check (payment_wallet is null or payment_wallet in ('easypaisa','jazzcash'));
alter table staff drop constraint if exists staff_payment_pair_check;
alter table staff add constraint staff_payment_pair_check
  check ((payment_number is null) = (payment_wallet is null));
alter table staff drop constraint if exists staff_iban_format_check;
alter table staff add constraint staff_iban_format_check
  check (iban is null or iban ~ '^PK[0-9]{2}[A-Z0-9]{20}$');

-- Member history: team_members.active already exists; add when/why a member left a team
alter table team_members add column if not exists started_on date not null default current_date;
alter table team_members add column if not exists ended_on date;
alter table team_members add column if not exists end_reason text;

-- Atomic swap: old member is kept (inactive, with end date + reason), new member takes the same member_no.
create or replace function replace_team_member(p_team uuid, p_old_staff uuid, p_new_staff uuid, p_reason text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_no int; v_role text;
begin
  select member_no, member_role into v_no, v_role
    from team_members where team_id = p_team and staff_id = p_old_staff and active;
  if not found then raise exception 'Outgoing member is not an active member of this team'; end if;
  if exists (select 1 from team_members where team_id = p_team and staff_id = p_new_staff and active) then
    raise exception 'Incoming staff member is already active on this team';
  end if;
  update team_members set active = false, ended_on = current_date, end_reason = p_reason
    where team_id = p_team and staff_id = p_old_staff;
  insert into team_members (team_id, staff_id, member_role, member_no, active, started_on, ended_on, end_reason)
    values (p_team, p_new_staff, v_role, v_no, true, current_date, null, null)
  on conflict (team_id, staff_id) do update
    set active = true, member_role = excluded.member_role, member_no = excluded.member_no,
        started_on = current_date, ended_on = null, end_reason = null;
end $$;
