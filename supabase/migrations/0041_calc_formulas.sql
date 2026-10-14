-- Calculation formulas, kept per union council and changeable only by an administrator or the UCMO:
--   doses of vaccine per child, and how many Blue / Red Vitamin A capsules are required per child (and which children each colour is for).
-- The Operational Plan trigger now reads these, so every team's daily plan gets its required doses and required capsules from them.
create table if not exists calc_formulas (
  id uuid not null default gen_random_uuid() unique,            -- the audit trigger records changes by id
  uc_id uuid primary key references union_councils(id) on delete cascade,
  doses_per_child numeric(6,3) not null default 1.11 check (doses_per_child > 0 and doses_per_child <= 10),
  blue_per_child numeric(6,3) not null default 1 check (blue_per_child >= 0 and blue_per_child <= 10),
  blue_base text not null default 'under_1' check (blue_base in ('under_1','age_1_5','all_children')),
  red_per_child numeric(6,3) not null default 1 check (red_per_child >= 0 and red_per_child <= 10),
  red_base text not null default 'age_1_5' check (red_base in ('under_1','age_1_5','all_children')),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
alter table calc_formulas enable row level security;
drop policy if exists cf_select on calc_formulas; drop policy if exists cf_insert on calc_formulas; drop policy if exists cf_update on calc_formulas;
create policy cf_select on calc_formulas for select using (uc_id in (select user_scope_uc_ids()));
create policy cf_insert on calc_formulas for insert with check (app_user_role() in ('admin','ucmo') and uc_id in (select user_scope_uc_ids()));
create policy cf_update on calc_formulas for update using (app_user_role() in ('admin','ucmo') and uc_id in (select user_scope_uc_ids())) with check (app_user_role() in ('admin','ucmo') and uc_id in (select user_scope_uc_ids()));
drop trigger if exists calc_formulas_audit on calc_formulas;
create trigger calc_formulas_audit after insert or update or delete on calc_formulas for each row execute function audit_trigger_fn();

alter table operational_plans add column if not exists blue_capsules_required int not null default 0;
alter table operational_plans add column if not exists red_capsules_required int not null default 0;

create or replace function operational_plans_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; c campaigns%rowtype; n_pics int; a_map text; f calc_formulas%rowtype; vit boolean; b_base numeric; r_base numeric;
begin
  select * into t from teams where id = new.team_id;
  select * into c from campaigns where id = new.campaign_id;
  if t.team_type is distinct from 'mobile' then raise exception 'The Operational Plan is only for Mobile Teams (Team % is %)', t.team_no, coalesce(t.team_type, 'not set yet'); end if;
  if c.uc_id is not null and t.uc_id <> c.uc_id then raise exception 'This team does not belong to the campaign''s union council'; end if;
  if c.status = 'closed' and tg_op = 'INSERT' then raise exception 'The campaign is closed'; end if;
  if tg_op = 'UPDATE' then
    if old.campaign_id <> new.campaign_id or old.team_id <> new.team_id or old.campaign_day <> new.campaign_day then raise exception 'Campaign, team and day of a plan cannot be changed'; end if;
    if old.status = 'submitted' and not plan_manager() and auth.uid() is not null then
      raise exception 'This plan is already submitted. Ask your UCMO or administrator to reopen it.';
    end if;
  end if;
  select * into f from calc_formulas where uc_id = c.uc_id;
  if not found then f.doses_per_child := 1.11; f.blue_per_child := 1; f.blue_base := 'under_1'; f.red_per_child := 1; f.red_base := 'age_1_5'; end if;
  select o_school, o_mmp into new.school_children, new.mmp_children from plan_children_totals(new.campaign_id, new.team_id, new.campaign_day);
  new.total_children := coalesce(new.children_households_1_5, 0) + coalesce(new.children_under_1, 0) + new.school_children + coalesce(new.mmp_children, 0);
  new.required_doses := round(new.total_children * f.doses_per_child, 2);          -- doses per child comes from the Calculation formulas page
  select coalesce((data ->> 'vit_a_needed') = 'yes', false) into vit from campaign_forms where campaign_id = new.campaign_id and form_type = 'campaign_setup';
  vit := coalesce(vit, false);
  b_base := case f.blue_base when 'under_1' then coalesce(new.children_under_1, 0) when 'age_1_5' then coalesce(new.children_households_1_5, 0) + new.school_children + coalesce(new.mmp_children, 0) else new.total_children end;
  r_base := case f.red_base when 'under_1' then coalesce(new.children_under_1, 0) when 'age_1_5' then coalesce(new.children_households_1_5, 0) + new.school_children + coalesce(new.mmp_children, 0) else new.total_children end;
  new.blue_capsules_required := case when vit then ceil(b_base * f.blue_per_child)::int else 0 end;
  new.red_capsules_required := case when vit then ceil(r_base * f.red_per_child)::int else 0 end;
  new.updated_at := now();
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    if coalesce(trim(new.village_area), '') = '' then raise exception 'Village / area name is required'; end if;
    if coalesce(trim(new.head_first_family), '') = '' then raise exception 'Name of Head of 1st Family is required'; end if;
    if coalesce(trim(new.head_last_family), '') = '' then raise exception 'Name of Head of Last Family is required'; end if;
    if new.children_households_1_5 is null or new.children_under_1 is null or new.total_households is null then raise exception 'Households and children figures must be filled in (enter 0 if there are none) before final submission'; end if;
    if tg_op = 'INSERT' then raise exception 'Save the plan and add its pictures before submitting'; end if;
    select count(*) into n_pics from operational_plan_pictures where plan_id = new.id;
    if n_pics < 3 then raise exception 'At least 3 pictures of the Operational Plan are required (% uploaded)', n_pics; end if;
    if not exists (select 1 from team_day_maps where campaign_id = new.campaign_id and team_id = new.team_id and campaign_day = new.campaign_day) then   -- one map per team per day
      raise exception 'The Day % map of Team % has not been uploaded', new.campaign_day, t.team_no;
    end if;
    select area_map_path into a_map from staff where id = t.aic_staff_id;
    if a_map is null then raise exception 'The Area Incharge''s Area Map has not been uploaded yet'; end if;
    new.submitted_at := now(); new.submitted_by := auth.uid();
  end if;
  if new.status = 'draft' and tg_op = 'UPDATE' and old.status = 'submitted' then new.submitted_at := null; new.submitted_by := null; end if;
  return new;
end $$;

-- when a formula, or the campaign's Vitamin A answer, changes, the plans of that union council / campaign are recalculated (the trigger above does the work)
create or replace function calc_formulas_recalc() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update operational_plans p set updated_at = now() from campaigns c where c.id = p.campaign_id and c.uc_id = new.uc_id and c.status <> 'closed';
  return null;
end $$;
drop trigger if exists calc_formulas_recalc_trg on calc_formulas;
create trigger calc_formulas_recalc_trg after insert or update on calc_formulas for each row execute function calc_formulas_recalc();
create or replace function campaign_setup_recalc() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.form_type = 'campaign_setup' then update operational_plans set updated_at = now() where campaign_id = new.campaign_id; end if;
  return null;
end $$;
drop trigger if exists campaign_setup_recalc_trg on campaign_forms;
create trigger campaign_setup_recalc_trg after insert or update on campaign_forms for each row execute function campaign_setup_recalc();

-- one-off: recalculate the plans that already exist so they carry the new capsule columns
update operational_plans set updated_at = now();
