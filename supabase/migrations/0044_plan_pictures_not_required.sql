-- Operational Plan: the 3 "plan pictures" per team/day are no longer required. Only the day-wise route map (team_day_maps) is needed to submit.
-- Additive/relaxing: same function as migration 0041 with the picture-count check removed. Existing pictures and rows are left untouched.
CREATE OR REPLACE FUNCTION public.operational_plans_biu()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t teams%rowtype; c campaigns%rowtype; a_map text; f calc_formulas%rowtype; vit boolean; b_base numeric; r_base numeric;
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
  new.required_doses := round(new.total_children * f.doses_per_child, 2);
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
    if tg_op = 'INSERT' then raise exception 'Save the plan before submitting'; end if;
    if not exists (select 1 from team_day_maps where campaign_id = new.campaign_id and team_id = new.team_id and campaign_day = new.campaign_day) then
      raise exception 'The Day % map of Team % has not been uploaded', new.campaign_day, t.team_no;
    end if;
    select area_map_path into a_map from staff where id = t.aic_staff_id;
    if a_map is null then raise exception 'The Area Incharge''s Area Map has not been uploaded yet'; end if;
    new.submitted_at := now(); new.submitted_by := auth.uid();
  end if;
  if new.status = 'draft' and tg_op = 'UPDATE' and old.status = 'submitted' then new.submitted_at := null; new.submitted_by := null; end if;
  return new;
end $function$;
