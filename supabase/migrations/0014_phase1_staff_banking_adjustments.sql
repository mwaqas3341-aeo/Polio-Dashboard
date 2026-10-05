-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-10-05 (as phase1_staff_banking_adjustments).
-- Phase 1: Staff Management + Campaign Details support.
-- Builds on 0013 (hierarchy, applied from another session as "staff_hierarchy").

-- ---------- Banks (searchable list; iban_code = 4-letter code embedded in Pakistani IBANs, NULL where not confirmed) ----------
create table if not exists banks (
  code text primary key,                 -- short abbreviation shown in the UI
  name text not null unique,
  iban_code text unique,                 -- characters 5-8 of the IBAN, when known
  kind text not null default 'bank' check (kind in ('bank','microfinance','wallet'))
);
alter table banks enable row level security;
drop policy if exists banks_select on banks; drop policy if exists banks_admin on banks;
create policy banks_select on banks for select to authenticated using (true);
create policy banks_admin on banks for all using (app_user_role() = 'admin') with check (app_user_role() = 'admin');

insert into banks (code, name, iban_code, kind) values
 ('HBL','Habib Bank Limited','HABB','bank'),
 ('MCB','MCB Bank Limited','MUCB','bank'),
 ('UBL','United Bank Limited','UNIL','bank'),
 ('ABL','Allied Bank Limited','ABPA','bank'),
 ('BAFL','Bank Alfalah Limited','ALFH','bank'),
 ('BAHL','Bank AL Habib Limited','BAHL','bank'),
 ('MEZN','Meezan Bank Limited','MEZN','bank'),
 ('NBP','National Bank of Pakistan','NBPA','bank'),
 ('FBL','Faysal Bank Limited','FAYS','bank'),
 ('SCBPL','Standard Chartered Bank (Pakistan)','SCBL','bank'),
 ('HMB','Habib Metropolitan Bank','MPBL','bank'),
 ('BOP','The Bank of Punjab','BPUN','bank'),
 ('BOK','The Bank of Khyber','KHYB','bank'),
 ('JSBL','JS Bank Limited','JSBL','bank'),
 ('SONERI','Soneri Bank Limited','SONE','bank'),
 ('SILK','Silkbank Limited','SAUD','bank'),
 ('SAMBA','Samba Bank Limited','SAMB','bank'),
 ('SUMMIT','Summit Bank Limited','SUMB','bank'),
 ('SINDH','Sindh Bank Limited','SIND','bank'),
 ('DIB','Dubai Islamic Bank Pakistan','DUIB','bank'),
 ('MIB','MCB Islamic Bank Limited','MCIB','bank'),
 ('FWBL','First Women Bank Limited','FWOM','bank'),
 ('TMFB','Telenor Microfinance Bank (Easypaisa)','TMFB','microfinance'),
 ('JCMA','Mobilink Microfinance Bank (JazzCash)','JCMA','microfinance'),
 ('WMBL','Mobilink Microfinance Bank (account)','WMBL','microfinance'),
 ('ASKARI','Askari Bank Limited',null,'bank'),
 ('BIPL','BankIslami Pakistan Limited',null,'bank'),
 ('ZTBL','Zarai Taraqiati Bank Limited',null,'bank'),
 ('CITI','Citibank N.A. Pakistan',null,'bank'),
 ('HSBC','HSBC Bank Middle East (Pakistan)',null,'bank'),
 ('KMBL','Khushhali Microfinance Bank',null,'microfinance'),
 ('FINCA','FINCA Microfinance Bank',null,'microfinance'),
 ('UMBL','U Microfinance Bank',null,'microfinance'),
 ('NRSP','NRSP Microfinance Bank',null,'microfinance'),
 ('OTHER','Other bank (not listed)',null,'bank')
on conflict (code) do nothing;

-- ---------- IBAN validation (Pakistan: PK + 2 check digits + 4-letter bank code + 16 alphanumeric; ISO 7064 mod-97) ----------
create or replace function is_valid_pk_iban(p text) returns boolean
language plpgsql immutable as $$
declare s text; ch text; i int; rem bigint := 0; v int;
begin
  if p is null or p !~ '^PK[0-9]{2}[A-Z]{4}[A-Z0-9]{16}$' then return false; end if;
  s := substr(p, 5) || substr(p, 1, 4);
  for i in 1..length(s) loop
    ch := substr(s, i, 1);
    if ch ~ '[0-9]' then rem := (rem * 10 + ch::int) % 97;
    else v := ascii(ch) - 55; rem := (rem * 100 + v) % 97; end if;
  end loop;
  return rem = 1;
end $$;

-- ---------- staff: father name, bank, wallet 'other', statuses, AIC 1-20, IBAN checksum ----------
alter table staff add column if not exists father_name text;
alter table staff add column if not exists bank_code text references banks(code);

alter table staff drop constraint if exists staff_payment_wallet_check;
alter table staff add constraint staff_payment_wallet_check check (payment_wallet is null or payment_wallet in ('easypaisa','jazzcash','other'));

do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid='staff'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%';
  if c is not null then execute format('alter table staff drop constraint %I', c); end if;
end $$;
alter table staff add constraint staff_status_check check (status in ('active','left_campaign','replaced','transferred','reserve','inactive'));

alter table staff drop constraint if exists staff_aic_no_check;
alter table staff add constraint staff_aic_no_check check ((designation = 'aic') = (aic_no is not null) and (aic_no is null or aic_no between 1 and 20));

alter table staff drop constraint if exists staff_iban_format_check;
alter table staff add constraint staff_iban_format_check check (iban is null or is_valid_pk_iban(iban));

create or replace function staff_bank_match() returns trigger language plpgsql set search_path = public as $$
declare ib text;
begin
  if new.iban is not null and new.bank_code is not null then
    select iban_code into ib from banks where code = new.bank_code;
    if ib is not null and ib <> substr(new.iban, 5, 4) then
      raise exception 'IBAN is for bank code % but the selected bank uses %', substr(new.iban, 5, 4), ib;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists staff_bank_match_trg on staff;
create trigger staff_bank_match_trg before insert or update on staff for each row execute function staff_bank_match();

-- leaving the active state (any non-active status) closes the person's team membership
create or replace function staff_deactivate_cascade() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    update team_members set active = false, ended_on = current_date, end_reason = 'Status changed to ' || new.status
      where staff_id = new.id and active;
  end if;
  return new;
end $$;

-- ---------- campaigns ----------
alter table campaigns drop constraint if exists campaigns_dates_check;
alter table campaigns add constraint campaigns_dates_check check (end_date >= start_date and total_days between 1 and 31) not valid;

create or replace function campaign_days_in_use(p_campaign uuid, p_new_total int) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'daily_reports', (select count(*) from daily_reports where campaign_id = p_campaign and campaign_day > p_new_total),
    'team_targets',  (select count(*) from team_targets  where campaign_id = p_campaign and campaign_day > p_new_total),
    'ddm_cards',     (select count(*) from ddm_cards     where campaign_id = p_campaign and campaign_day > p_new_total));
$$;

-- ---------- adjustment history (append-only) ----------
create table if not exists staff_adjustment_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete set null,
  uc_id uuid not null references union_councils(id),
  ucmo_staff_id uuid references staff(id) on delete set null,
  staff_id uuid not null references staff(id),
  adjustment_type text not null check (adjustment_type in ('assign','leave','transfer','reserve','replaced','replacement_in','swap')),
  from_team_id uuid references teams(id) on delete set null,
  to_team_id uuid references teams(id) on delete set null,
  from_team_no int, to_team_no int,
  from_team_type text, to_team_type text,
  from_aic_id uuid references staff(id) on delete set null,
  to_aic_id uuid references staff(id) on delete set null,
  reason text,
  effective_date date not null default current_date,
  details jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sah_staff_idx on staff_adjustment_history (staff_id, created_at desc);
create index if not exists sah_uc_idx on staff_adjustment_history (uc_id, created_at desc);
create index if not exists sah_campaign_idx on staff_adjustment_history (campaign_id);
alter table staff_adjustment_history enable row level security;
drop policy if exists sah_select on staff_adjustment_history; drop policy if exists sah_insert on staff_adjustment_history;
create policy sah_select on staff_adjustment_history for select using (
  uc_id in (select user_scope_uc_ids())
  and (app_user_role() <> 'aic' or from_aic_id = my_staff_id() or to_aic_id = my_staff_id()));
create policy sah_insert on staff_adjustment_history for insert with check (can_manage() and uc_id in (select user_scope_uc_ids()));
-- no update/delete policies: history cannot be edited or removed through the API

-- ---------- adjustment engine ----------
create or replace function _adj_free_slot(p_team uuid) returns int language sql stable set search_path = public as $$
  select s from generate_series(1,2) s where not exists (select 1 from team_members where team_id = p_team and active and member_no = s) order by s limit 1;
$$;

create or replace function _adj_log(p_type text, p_staff uuid, p_campaign uuid, p_from uuid, p_to uuid, p_reason text, p_date date, p_details jsonb)
returns void language plpgsql set search_path = public as $$
declare f teams%rowtype; t teams%rowtype; v_uc uuid;
begin
  if p_from is not null then select * into f from teams where id = p_from; end if;
  if p_to is not null then select * into t from teams where id = p_to; end if;
  v_uc := coalesce(t.uc_id, f.uc_id, (select uc_id from staff where id = p_staff));
  insert into staff_adjustment_history (campaign_id, uc_id, ucmo_staff_id, staff_id, adjustment_type, from_team_id, to_team_id,
      from_team_no, to_team_no, from_team_type, to_team_type, from_aic_id, to_aic_id, reason, effective_date, details)
  values (p_campaign, v_uc,
      (select id from staff where uc_id = v_uc and designation = 'ucmo' and status = 'active' limit 1),
      p_staff, p_type, p_from, p_to, f.team_no, t.team_no, f.team_type, t.team_type, f.aic_staff_id, t.aic_staff_id,
      nullif(trim(coalesce(p_reason,'')), ''), coalesce(p_date, current_date), p_details);
end $$;

create or replace function _adj_close(p_staff uuid, p_date date, p_reason text, out o_team uuid, out o_slot int)
language plpgsql set search_path = public as $$
begin
  update team_members set active = false, ended_on = p_date, end_reason = p_reason
    where staff_id = p_staff and active returning team_id, member_no into o_team, o_slot;
end $$;

create or replace function _adj_place(p_staff uuid, p_team uuid, p_slot int, p_date date)
returns void language plpgsql set search_path = public as $$
declare v_slot int := p_slot;
begin
  if v_slot is null or exists (select 1 from team_members where team_id = p_team and active and member_no = v_slot) then
    v_slot := _adj_free_slot(p_team);
  end if;
  if v_slot is null then raise exception 'TEAM_FULL: team already has 2 active members'; end if;
  update staff set status = 'active' where id = p_staff and status <> 'active';
  insert into team_members (team_id, staff_id, member_role, member_no, active, started_on)
  values (p_team, p_staff, case when v_slot = 1 then 'leader' else 'member' end, v_slot, true, p_date)
  on conflict (team_id, staff_id) do update
    set active = true, member_role = excluded.member_role, member_no = excluded.member_no,
        started_on = p_date, ended_on = null, end_reason = null;
end $$;

create or replace function adjust_team_member(
  p_action text, p_staff uuid, p_reason text default null, p_campaign uuid default null,
  p_to_team uuid default null, p_replace_staff uuid default null, p_old_disposition text default null,
  p_old_to_team uuid default null, p_swap_with uuid default null, p_effective date default current_date)
returns jsonb language plpgsql set search_path = public as $$
declare a_team uuid; a_slot int; b_team uuid; b_slot int; n int; v_status text;
begin
  if p_action not in ('assign','leave','reserve','transfer','replace','swap') then raise exception 'Unknown action %', p_action; end if;
  if p_action <> 'assign' and length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A reason is required for this adjustment'; end if;
  perform 1 from staff where id = p_staff and designation = 'team_member';
  if not found then raise exception 'Staff member not found or is not a Team Member'; end if;

  if p_action in ('assign','transfer') then
    if p_to_team is null then raise exception 'Choose the destination team'; end if;
    select count(*) into n from team_members where team_id = p_to_team and active and staff_id <> p_staff;
    if n >= 2 then raise exception 'TEAM_FULL: this team already has 2 active members — use Replace to choose who leaves'; end if;
    select o_team, o_slot into a_team, a_slot from _adj_close(p_staff, p_effective, 'Transferred');
    if a_team = p_to_team then raise exception 'The member is already in this team'; end if;
    perform _adj_place(p_staff, p_to_team, null, p_effective);
    perform _adj_log(case when a_team is null then 'assign' else 'transfer' end, p_staff, p_campaign, a_team, p_to_team, p_reason, p_effective, null);

  elsif p_action in ('leave','reserve') then
    select o_team, o_slot into a_team, a_slot from _adj_close(p_staff, p_effective, p_reason);
    v_status := case p_action when 'leave' then 'left_campaign' else 'reserve' end;
    update staff set status = v_status where id = p_staff;
    perform _adj_log(p_action, p_staff, p_campaign, a_team, null, p_reason, p_effective, jsonb_build_object('new_status', v_status));

  elsif p_action = 'replace' then
    if p_to_team is null or p_replace_staff is null then raise exception 'Choose the team and the member to be replaced'; end if;
    if p_old_disposition not in ('left_campaign','transfer','reserve','other') then raise exception 'Choose what happens to the replaced member'; end if;
    perform 1 from team_members where team_id = p_to_team and staff_id = p_replace_staff and active;
    if not found then raise exception 'The member to be replaced is not active in this team'; end if;
    -- outgoing member
    select o_team, o_slot into b_team, b_slot from _adj_close(p_replace_staff, p_effective, 'Replaced by another member');
    if p_old_disposition = 'transfer' then
      if p_old_to_team is null or p_old_to_team = p_to_team then raise exception 'Choose a different team for the replaced member'; end if;
      select count(*) into n from team_members where team_id = p_old_to_team and active;
      if n >= 2 then raise exception 'TEAM_FULL: the destination team for the replaced member is full'; end if;
      perform _adj_place(p_replace_staff, p_old_to_team, null, p_effective);
      perform _adj_log('transfer', p_replace_staff, p_campaign, b_team, p_old_to_team, p_reason, p_effective, jsonb_build_object('replaced_by', p_staff));
    else
      v_status := case p_old_disposition when 'left_campaign' then 'left_campaign' when 'reserve' then 'reserve' else 'replaced' end;
      update staff set status = v_status where id = p_replace_staff;
      perform _adj_log('replaced', p_replace_staff, p_campaign, b_team, null, p_reason, p_effective,
        jsonb_build_object('new_status', v_status, 'disposition', p_old_disposition, 'replaced_by', p_staff));
    end if;
    -- incoming member takes the freed slot
    select o_team, o_slot into a_team, a_slot from _adj_close(p_staff, p_effective, 'Moved to replace another member');
    perform _adj_place(p_staff, p_to_team, b_slot, p_effective);
    perform _adj_log('replacement_in', p_staff, p_campaign, a_team, p_to_team, p_reason, p_effective, jsonb_build_object('replaces', p_replace_staff));

  elsif p_action = 'swap' then
    if p_swap_with is null then raise exception 'Choose the member to swap with'; end if;
    select o_team, o_slot into a_team, a_slot from _adj_close(p_staff, p_effective, 'Swapped');
    select o_team, o_slot into b_team, b_slot from _adj_close(p_swap_with, p_effective, 'Swapped');
    if a_team is null or b_team is null then raise exception 'Both members must be active on a team to swap'; end if;
    if a_team = b_team then raise exception 'Both members are already in the same team'; end if;
    perform _adj_place(p_staff, b_team, b_slot, p_effective);
    perform _adj_place(p_swap_with, a_team, a_slot, p_effective);
    perform _adj_log('swap', p_staff, p_campaign, a_team, b_team, p_reason, p_effective, jsonb_build_object('swapped_with', p_swap_with));
    perform _adj_log('swap', p_swap_with, p_campaign, b_team, a_team, p_reason, p_effective, jsonb_build_object('swapped_with', p_staff));
  end if;
  return jsonb_build_object('ok', true, 'action', p_action);
end $$;

-- old swap function from 0011 now goes through the same engine so history is always recorded
create or replace function replace_team_member(p_team uuid, p_old_staff uuid, p_new_staff uuid, p_reason text)
returns void language plpgsql set search_path = public as $$
begin
  perform adjust_team_member('replace', p_new_staff, coalesce(p_reason, 'Replaced'), null, p_team, p_old_staff, 'reserve', null, null, current_date);
end $$;

revoke all on function adjust_team_member(text,uuid,text,uuid,uuid,uuid,text,uuid,uuid,date) from public, anon;
grant execute on function adjust_team_member(text,uuid,text,uuid,uuid,uuid,text,uuid,uuid,date) to authenticated;
revoke all on function _adj_free_slot(uuid), _adj_log(text,uuid,uuid,uuid,uuid,text,date,jsonb), _adj_close(uuid,date,text), _adj_place(uuid,uuid,int,date) from public, anon;
grant execute on function _adj_free_slot(uuid), _adj_log(text,uuid,uuid,uuid,uuid,text,date,jsonb), _adj_close(uuid,date,text), _adj_place(uuid,uuid,int,date) to authenticated;
revoke all on function campaign_days_in_use(uuid,int) from public, anon;
grant execute on function campaign_days_in_use(uuid,int) to authenticated;
