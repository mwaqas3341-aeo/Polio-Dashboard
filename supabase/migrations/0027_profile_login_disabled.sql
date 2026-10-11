-- Lets the Login accounts page show which staff logins are switched off (set only by the staff-accounts function).
alter table profiles add column if not exists login_disabled boolean not null default false;
