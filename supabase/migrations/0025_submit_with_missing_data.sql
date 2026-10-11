-- NOT YET APPLIED (apply after 0024). Re-creates operational_plans_biu() exactly as it is live today, except that final submission
-- no longer requires completeness. A plan can now be submitted with whatever is available: missing village name, family-head names,
-- household/children figures (they stay NULL, never a fake 0), pictures, the Day map or the AIC Area Map do not block it.
-- Unchanged: Mobile-team rule, campaign/UC checks, closed-campaign rule, locking of submitted plans, school/MMP totals, doses = children x 1.11.
create or replace function operational_plans_biu() returns trigger language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; c campaigns%rowtype;
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
  select o_school, o_mmp into new.school_children, new.mmp_children from plan_children_totals(new.campaign_id, new.team_id, new.campaign_day);
  new.total_children := coalesce(new.children_households_1_5, 0) + coalesce(new.children_under_1, 0) + new.school_children;
  new.required_doses := round(new.total_children * 1.11, 2);
  new.updated_at := now();
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.submitted_at := now(); new.submitted_by := auth.uid();
  end if;
  if new.status = 'draft' and tg_op = 'UPDATE' and old.status = 'submitted' then new.submitted_at := null; new.submitted_by := null; end if;
  return new;
end $$;
