-- Columns required by the official 2A forms (campaign days and catch-up days). Additive only: every existing column is kept.
alter table daily_reports
  add column if not exists children_target integer default 0,
  add column if not exists missed_na integer default 0,
  add column if not exists missed_refusal integer default 0,
  add column if not exists covered_na integer default 0,
  add column if not exists covered_refusal integer default 0,
  add column if not exists school_madrassa_children integer default 0,
  add column if not exists mmp_registered integer default 0,
  add column if not exists mmp_vaccinated integer default 0,
  add column if not exists vaccine_doses_returned numeric default 0,
  add column if not exists finger_markers_returned integer default 0,
  add column if not exists persistent_missed integer default 0,
  add column if not exists cu_target_na_u12 integer default 0, add column if not exists cu_target_na_1259 integer default 0,
  add column if not exists cu_target_r_u12 integer default 0, add column if not exists cu_target_r_1259 integer default 0,
  add column if not exists cu_cov_na_u12 integer default 0, add column if not exists cu_cov_na_1259 integer default 0,
  add column if not exists cu_cov_r_u12 integer default 0, add column if not exists cu_cov_r_1259 integer default 0,
  add column if not exists cu_still_na_u12 integer default 0, add column if not exists cu_still_na_1259 integer default 0,
  add column if not exists cu_still_r_u12 integer default 0, add column if not exists cu_still_r_1259 integer default 0;
