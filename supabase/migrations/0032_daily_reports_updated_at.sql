-- Lets the UCMO's 2B form show when each Area Incharge last updated reports. Additive only.
alter table daily_reports add column if not exists updated_at timestamptz not null default now();
create or replace function daily_reports_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists daily_reports_touch_trg on daily_reports;
create trigger daily_reports_touch_trg before update on daily_reports for each row execute function daily_reports_touch();
