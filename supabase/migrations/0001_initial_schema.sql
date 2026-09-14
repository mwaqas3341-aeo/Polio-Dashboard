-- ============================================================
-- Polio Campaign Management Dashboard — Initial Schema
-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Mirrors the live migration; if you change the schema, apply the
-- change via Supabase (apply_migration) AND add a new file here
-- with the same SQL so the repo stays the source of truth.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Geography / org hierarchy ----------
create table districts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table tehsils (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references districts(id) on delete cascade,
  name text not null,
  unique (district_id, name)
);

create table union_councils (
  id uuid primary key default gen_random_uuid(),
  tehsil_id uuid not null references tehsils(id) on delete cascade,
  name text not null,
  unique (tehsil_id, name)
);

-- ---------- People ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null default 'area_incharge' check (role in ('admin','district_coordinator','aic','encoder','viewer')),
  uc_id uuid references union_councils(id),
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cnic text,
  phone text,
  designation text,
  category text,
  status text not null default 'active' check (status in ('active','inactive')),
  uc_id uuid references union_councils(id),
  created_at timestamptz not null default now(),
  unique (cnic)
);

-- ---------- Teams (persistent master, reused across campaigns) ----------
create table teams (
  id uuid primary key default gen_random_uuid(),
  team_no int not null,
  uc_id uuid not null references union_councils(id) on delete cascade,
  team_type text not null check (team_type in ('mobile_cbv','fixed','transit')),
  aic_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (uc_id, team_no)
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('leader','member')),
  active boolean not null default true,
  unique (team_id, staff_id)
);

-- ---------- Campaigns ----------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null check (campaign_type in ('NID','SNID')),
  start_date date not null,
  end_date date not null,
  total_days int not null,
  district_id uuid references districts(id),
  tehsil_id uuid references tehsils(id),
  uc_id uuid references union_councils(id),
  status text not null default 'planning' check (status in ('planning','active','catchup','closed')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table campaign_teams (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  unique (campaign_id, team_id)
);

-- ---------- Planning inputs ----------
create table schools (
  id uuid primary key default gen_random_uuid(),
  uc_id uuid not null references union_councils(id) on delete cascade,
  name text not null,
  head_teacher_name text,
  head_teacher_phone text,
  created_at timestamptz not null default now()
);

create table school_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  team_no int not null,
  campaign_day int not null,
  target_children int not null default 0,
  unique (campaign_id, school_id)
);

create table mmp_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cnic text,
  phone text,
  location text,
  area_of_origin text,
  uc_id uuid references union_councils(id),
  created_at timestamptz not null default now()
);

create table mmp_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  mmp_contact_id uuid not null references mmp_contacts(id) on delete cascade,
  team_no int not null,
  campaign_day int not null,
  house_count int not null default 0,
  child_count int not null default 0,
  unique (campaign_id, mmp_contact_id)
);

create table households (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  campaign_day int not null,
  house_no int not null,
  head_of_family text,
  phone text,
  street_muhalla text,
  building_name text,
  children_under_12m int not null default 0,
  children_12_59m int not null default 0,
  created_at timestamptz not null default now()
);

create table missed_children (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  child_name text not null,
  father_name text,
  age_months int,
  address text,
  team_no int,
  campaign_day int,
  house_no int,
  covered_this_round boolean not null default false,
  carried_from_campaign_id uuid references campaigns(id),
  created_at timestamptz not null default now()
);

-- ---------- Daily actuals (2A form / field reporting) ----------
create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  campaign_day int not null,
  is_catchup boolean not null default false,
  households_target int default 0,
  households_visited int default 0,
  children_vaccinated_first_visit int default 0,
  missed_children_under_12m int default 0,
  missed_children_12_59m int default 0,
  refusal_under_12m int default 0,
  refusal_12_59m int default 0,
  catchup_covered int default 0,
  still_missed int default 0,
  guest_vaccinated int default 0,
  street_vaccinated int default 0,
  hrmp_vaccinated int default 0,
  vaccine_doses_received numeric default 0,
  vaccine_doses_used numeric default 0,
  vitamin_a_red int default 0,
  vitamin_a_blue int default 0,
  finger_markers_received int default 0,
  afp_cases_notified int default 0,
  zero_dose_ri_recorded int default 0,
  zero_zero_houses int default 0,
  lock_houses int default 0,
  reported_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (campaign_id, team_no, campaign_day, is_catchup)
);

-- ---------- Supervision (Micro_plan_perfromas forms) ----------
create table supervision_visits (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  visit_date date not null,
  visit_time time,
  purpose text,
  feedback text,
  reviewer_name text,
  form_type text check (form_type in ('tour_plan','field_validation','desk_review')),
  created_at timestamptz not null default now()
);

-- ---------- DDM cards ----------
create table ddm_cards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_no int not null,
  campaign_day int not null,
  card_number text,
  staff_id uuid references staff(id),
  printed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Audit log ----------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Derived planning view (Team Micro Plan Summary equivalent) ----------
create view team_day_plan as
select
  c.id as campaign_id,
  t.team_no,
  t.campaign_day,
  coalesce(sa.school_children, 0) as school_children,
  coalesce(hh.household_children, 0) as household_children,
  coalesce(sa.school_children,0) + coalesce(hh.household_children,0) as total_children,
  round((coalesce(sa.school_children,0) + coalesce(hh.household_children,0)) * 1.11, 2) as vaccine_needed,
  coalesce(hh.total_houses, 0) as target_households
from campaigns c
cross join lateral (
  select distinct team_no, campaign_day from school_assignments where campaign_id = c.id
  union
  select distinct team_no, campaign_day from households where campaign_id = c.id
) t
left join (
  select campaign_id, team_no, campaign_day, sum(target_children) as school_children
  from school_assignments group by campaign_id, team_no, campaign_day
) sa on sa.campaign_id = c.id and sa.team_no = t.team_no and sa.campaign_day = t.campaign_day
left join (
  select campaign_id, team_no, campaign_day,
    count(*) as total_houses,
    sum(children_under_12m + children_12_59m) as household_children
  from households group by campaign_id, team_no, campaign_day
) hh on hh.campaign_id = c.id and hh.team_no = t.team_no and hh.campaign_day = t.campaign_day;

alter view team_day_plan set (security_invoker = true);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table districts enable row level security;
alter table tehsils enable row level security;
alter table union_councils enable row level security;
alter table profiles enable row level security;
alter table staff enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table campaigns enable row level security;
alter table campaign_teams enable row level security;
alter table schools enable row level security;
alter table school_assignments enable row level security;
alter table mmp_contacts enable row level security;
alter table mmp_assignments enable row level security;
alter table households enable row level security;
alter table missed_children enable row level security;
alter table daily_reports enable row level security;
alter table supervision_visits enable row level security;
alter table ddm_cards enable row level security;
alter table audit_log enable row level security;

-- Baseline policy: any authenticated user can read/write for now.
-- (To be tightened to role/UC-scoped policies once auth + roles are wired up.)
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'districts','tehsils','union_councils','profiles','staff','teams','team_members',
    'campaigns','campaign_teams','schools','school_assignments','mmp_contacts',
    'mmp_assignments','households','missed_children','daily_reports',
    'supervision_visits','ddm_cards','audit_log'
  ])
  loop
    execute format('create policy %I on %I for select using (auth.role() = ''authenticated'')', tbl || '_select_auth', tbl);
    execute format('create policy %I on %I for insert with check (auth.role() = ''authenticated'')', tbl || '_insert_auth', tbl);
    execute format('create policy %I on %I for update using (auth.role() = ''authenticated'')', tbl || '_update_auth', tbl);
    execute format('create policy %I on %I for delete using (auth.role() = ''authenticated'')', tbl || '_delete_auth', tbl);
  end loop;
end $$;
