-- Applied to Supabase project zeqbepueevdnhlvoykvz on 2026-09-14.
-- Needed so DDM card generation can upsert one card per team/day per
-- campaign without creating duplicates.
alter table ddm_cards add constraint ddm_cards_campaign_team_day_unique unique (campaign_id, team_no, campaign_day);
