-- Which 2A forms have actually been prepared (one row per campaign x Area Incharge x day). The form itself is always regenerated from the latest saved
-- team reports, so this table only records "prepared" status; re-preparing updates the same row (no duplicates). Additive only.
create table if not exists prepared_forms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  aic_staff_id uuid not null references staff(id),
  form_type text not null default '2a' check (form_type in ('2a')),
  campaign_day integer not null check (campaign_day >= 1),
  is_catchup boolean not null default false,
  teams_total integer not null default 0 check (teams_total >= 0),
  teams_reported integer not null default 0 check (teams_reported >= 0),
  prepared_by uuid default auth.uid(),
  prepared_at timestamptz not null default now()
);
create unique index if not exists prepared_forms_uq on prepared_forms (campaign_id, aic_staff_id, form_type, campaign_day, is_catchup);
create index if not exists prepared_forms_campaign_idx on prepared_forms (campaign_id);

alter table prepared_forms enable row level security;
drop policy if exists pf_select on prepared_forms; drop policy if exists pf_insert on prepared_forms; drop policy if exists pf_update on prepared_forms; drop policy if exists pf_delete on prepared_forms;
create policy pf_select on prepared_forms for select using (campaign_form_visible(campaign_id, aic_staff_id));
create policy pf_insert on prepared_forms for insert with check (can_enter_data() and campaign_form_visible(campaign_id, aic_staff_id));
create policy pf_update on prepared_forms for update using (can_enter_data() and campaign_form_visible(campaign_id, aic_staff_id)) with check (can_enter_data() and campaign_form_visible(campaign_id, aic_staff_id));
create policy pf_delete on prepared_forms for delete using (plan_manager() and campaign_form_visible(campaign_id, aic_staff_id));
drop trigger if exists prepared_forms_audit on prepared_forms;
create trigger prepared_forms_audit after insert or update or delete on prepared_forms for each row execute function audit_trigger_fn();
