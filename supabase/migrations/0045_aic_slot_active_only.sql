-- Only ACTIVE Area Incharges occupy an AIC number (slot) in a union council.
-- Inactive AICs keep their old number for history and no longer block a replacement.
drop index if exists staff_aic_no_uniq;
create unique index if not exists staff_aic_no_uniq
  on staff (uc_id, aic_no)
  where designation = 'aic' and status = 'active';
