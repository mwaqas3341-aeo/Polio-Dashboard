-- Supervision and UC-level planning formats from the 2026 workbooks:
--   AIC level (aic_staff_id set):  desk_review, field_validation, tour_plan
--   UC level  (aic_staff_id null): uc_summary (manual fields only; totals are always calculated live), sm_plan
-- One generic table (same pattern as aic_microplan_figures) so no per-form tables are needed. Additive only.
create table if not exists campaign_forms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  aic_staff_id uuid references staff(id),
  form_type text not null check (form_type in ('desk_review','field_validation','tour_plan','uc_summary','sm_plan')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((form_type in ('desk_review','field_validation','tour_plan')) = (aic_staff_id is not null))
);
create unique index if not exists campaign_forms_uq on campaign_forms (campaign_id, form_type, coalesce(aic_staff_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function campaign_form_visible(p_campaign uuid, p_aic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns c where c.id = p_campaign and c.uc_id in (select user_scope_uc_ids()))
     and (p_aic is null or aic_figures_visible(p_aic));
$$;

create or replace function campaign_forms_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare c campaigns%rowtype; s staff%rowtype;
begin
  select * into c from campaigns where id = new.campaign_id;
  if new.aic_staff_id is not null then
    select * into s from staff where id = new.aic_staff_id;
    if s.designation is distinct from 'aic' then raise exception 'This form belongs to an Area Incharge'; end if;
    if c.uc_id is not null and s.uc_id <> c.uc_id then raise exception 'This Area Incharge does not belong to the campaign''s union council'; end if;
  end if;
  if tg_op = 'UPDATE' and (old.campaign_id <> new.campaign_id or old.form_type <> new.form_type or old.aic_staff_id is distinct from new.aic_staff_id) then raise exception 'Campaign, form type and Area Incharge cannot be changed'; end if;
  if tg_op = 'INSERT' and c.status = 'closed' then raise exception 'The campaign is closed'; end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists campaign_forms_biu_trg on campaign_forms;
create trigger campaign_forms_biu_trg before insert or update on campaign_forms for each row execute function campaign_forms_biu();

alter table campaign_forms enable row level security;
drop policy if exists cf_select on campaign_forms; drop policy if exists cf_insert on campaign_forms;
drop policy if exists cf_update on campaign_forms; drop policy if exists cf_delete on campaign_forms;
create policy cf_select on campaign_forms for select using (campaign_form_visible(campaign_id, aic_staff_id));
create policy cf_insert on campaign_forms for insert with check (can_enter_data() and campaign_form_visible(campaign_id, aic_staff_id) and (aic_staff_id is not null or plan_manager()));
create policy cf_update on campaign_forms for update using (can_enter_data() and campaign_form_visible(campaign_id, aic_staff_id) and (aic_staff_id is not null or plan_manager()))
                                                    with check (can_enter_data() and campaign_form_visible(campaign_id, aic_staff_id) and (aic_staff_id is not null or plan_manager()));
create policy cf_delete on campaign_forms for delete using (plan_manager() and campaign_form_visible(campaign_id, aic_staff_id));

drop trigger if exists campaign_forms_audit on campaign_forms;
create trigger campaign_forms_audit after insert or update or delete on campaign_forms for each row execute function audit_trigger_fn();
