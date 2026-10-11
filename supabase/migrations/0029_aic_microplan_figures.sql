-- Applied to the live Supabase project on 2026-10-11.
-- AIC Summary MP fields that exist nowhere else in the system (DDM cards, supplies, refusals, zero-dose, madaris, ...).
-- One row per campaign x Area Incharge; figures is a JSON object. A missing key / null = "not answered yet", never a fake zero.
create table if not exists aic_microplan_figures (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  aic_staff_id uuid not null references staff(id),
  figures jsonb not null default '{}'::jsonb check (jsonb_typeof(figures) = 'object'),
  created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, aic_staff_id)
);

create or replace function aic_figures_visible(p_aic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff s where s.id = p_aic and s.designation = 'aic'
                 and s.uc_id in (select user_scope_uc_ids())
                 and (app_user_role() <> 'aic' or s.id = my_staff_id()));
$$;

create or replace function aic_microplan_figures_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare c campaigns%rowtype; s staff%rowtype;
begin
  select * into c from campaigns where id = new.campaign_id;
  select * into s from staff where id = new.aic_staff_id;
  if s.designation is distinct from 'aic' then raise exception 'These figures belong to an Area Incharge'; end if;
  if c.uc_id is not null and s.uc_id <> c.uc_id then raise exception 'This Area Incharge does not belong to the campaign''s union council'; end if;
  if tg_op = 'UPDATE' and (old.campaign_id <> new.campaign_id or old.aic_staff_id <> new.aic_staff_id) then raise exception 'Campaign and Area Incharge cannot be changed'; end if;
  if tg_op = 'INSERT' and c.status = 'closed' then raise exception 'The campaign is closed'; end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists aic_microplan_figures_biu_trg on aic_microplan_figures;
create trigger aic_microplan_figures_biu_trg before insert or update on aic_microplan_figures for each row execute function aic_microplan_figures_biu();

alter table aic_microplan_figures enable row level security;
drop policy if exists aic_fig_select on aic_microplan_figures; drop policy if exists aic_fig_insert on aic_microplan_figures;
drop policy if exists aic_fig_update on aic_microplan_figures; drop policy if exists aic_fig_delete on aic_microplan_figures;
create policy aic_fig_select on aic_microplan_figures for select using (aic_figures_visible(aic_staff_id));
create policy aic_fig_insert on aic_microplan_figures for insert with check (can_enter_data() and aic_figures_visible(aic_staff_id));
create policy aic_fig_update on aic_microplan_figures for update using (can_enter_data() and aic_figures_visible(aic_staff_id)) with check (can_enter_data() and aic_figures_visible(aic_staff_id));
create policy aic_fig_delete on aic_microplan_figures for delete using (plan_manager() and aic_figures_visible(aic_staff_id));

drop trigger if exists aic_microplan_figures_audit on aic_microplan_figures;
create trigger aic_microplan_figures_audit after insert or update or delete on aic_microplan_figures for each row execute function audit_trigger_fn();
