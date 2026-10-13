-- Catch-up days now use ONE column per figure (total children) instead of the NA/R x <12m/12-59m split, and Already Vaccinated children is recorded from day 2.
-- Additive only: the old cu_*_na_u12 ... columns and every existing row are kept.
alter table daily_reports
  add column if not exists cu_target integer not null default 0 check (cu_target >= 0),
  add column if not exists cu_cov integer not null default 0 check (cu_cov >= 0),
  add column if not exists cu_still integer not null default 0 check (cu_still >= 0),
  add column if not exists already_vaccinated integer not null default 0 check (already_vaccinated >= 0);

-- carry earlier catch-up reports over to the single-column figures
update daily_reports set
  cu_target = coalesce(cu_target_na_u12,0)+coalesce(cu_target_na_1259,0)+coalesce(cu_target_r_u12,0)+coalesce(cu_target_r_1259,0),
  cu_cov    = coalesce(cu_cov_na_u12,0)+coalesce(cu_cov_na_1259,0)+coalesce(cu_cov_r_u12,0)+coalesce(cu_cov_r_1259,0)
where is_catchup and cu_target = 0 and cu_cov = 0;
update daily_reports set cu_still = greatest(0, cu_target - cu_cov) where is_catchup and cu_still = 0;
