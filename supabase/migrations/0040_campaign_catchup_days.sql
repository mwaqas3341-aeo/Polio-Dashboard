-- Campaign setup: total_days stays the number of REGULAR days; catchup_days is how many catch-up days follow; catchup_start_day is the day number catch-up starts on.
-- Existing campaigns keep the three catch-up slots they have always had. Additive only.
alter table campaigns add column if not exists catchup_days int not null default 3 check (catchup_days between 0 and 5);
alter table campaigns add column if not exists catchup_start_day int generated always as (total_days + 1) stored;
