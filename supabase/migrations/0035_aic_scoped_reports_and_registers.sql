-- NOT YET APPLIED. Run once in the Supabase SQL editor.
-- Until now these four tables were scoped by union council only, so any Area Incharge could read (and edit) every team's
-- 2A daily reports, house registrations, DDM cards and supervision visits in the UC — and the AIC "PDF Downloads" 2A pages
-- were only filtered in the browser. Same rule as 0034: an AIC works only with their own teams (aic_owns_team).
-- Admin, district coordinator, UCMO, encoder and viewer behave exactly as before (aic_owns_team() is true for them).
do $$
declare tbl text;
begin
  for tbl in select unnest(array['daily_reports','households','ddm_cards','supervision_visits'])
  loop
    execute format('drop policy if exists %I on %I', tbl || '_select', tbl);
    execute format('drop policy if exists %I on %I', tbl || '_write', tbl);
    execute format('drop policy if exists %I on %I', tbl || '_update', tbl);
    execute format('drop policy if exists %I on %I', tbl || '_delete', tbl);
    execute format($f$create policy %I on %I for select using (
        campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no))$f$, tbl || '_select', tbl);
    execute format($f$create policy %I on %I for insert with check (
        can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no))$f$, tbl || '_write', tbl);
    execute format($f$create policy %I on %I for update using (
        can_enter_data() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no))
        with check (aic_owns_team(campaign_id, team_no))$f$, tbl || '_update', tbl);
    execute format($f$create policy %I on %I for delete using (
        can_manage() and campaign_id in (select id from campaigns where uc_id in (select user_scope_uc_ids())) and aic_owns_team(campaign_id, team_no))$f$, tbl || '_delete', tbl);
  end loop;
end $$;
