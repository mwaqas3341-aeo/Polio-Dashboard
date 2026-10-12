-- Plan questionnaire: UC-level 'campaign_setup' (vitamin A capsule question, completion flag) and AIC-level 'plan_setup' (per-team answers).
-- Extends the form types of campaign_forms (migration 0030). Additive only.
alter table campaign_forms drop constraint if exists campaign_forms_form_type_check;
alter table campaign_forms drop constraint if exists campaign_forms_check;
alter table campaign_forms add constraint campaign_forms_form_type_check check (form_type in ('desk_review','field_validation','tour_plan','plan_setup','uc_summary','sm_plan','campaign_setup'));
alter table campaign_forms add constraint campaign_forms_check check ((form_type in ('desk_review','field_validation','tour_plan','plan_setup')) = (aic_staff_id is not null));
