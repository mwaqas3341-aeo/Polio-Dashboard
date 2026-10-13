-- One route map per TEAM per campaign day (3 per team in a 3-day campaign). The AIC map and the UC map stay single records on staff.area_map_path.
-- operational_day_maps (older, one per AIC per day) is kept untouched for history but is no longer used by the screens.
create table if not exists team_day_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  campaign_day int not null check (campaign_day >= 1),
  storage_path text not null,
  uploaded_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, team_id, campaign_day)
);
create index if not exists team_day_maps_team_idx on team_day_maps (team_id);
alter table team_day_maps enable row level security;
drop policy if exists tdm_select on team_day_maps; drop policy if exists tdm_write on team_day_maps;
create policy tdm_select on team_day_maps for select using (plan_team_visible(team_id));
create policy tdm_write on team_day_maps for all using (can_enter_data() and plan_team_visible(team_id)) with check (can_enter_data() and plan_team_visible(team_id));
