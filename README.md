# Polio Campaign Management Dashboard

Production dashboard for planning and reporting Polio (NID/SNID) campaigns —
built for the Layyah district school education department, Area Incharge
workflow. Static frontend on GitHub Pages, Supabase for auth/database.

**Live Supabase project:** `zeqbepueevdnhlvoykvz` ("Polio Dash Board Management")

## Why it's built this way

The source reference material (5 campaign workbooks — school lists, MMP/CNIC
contact lists, house registration, missed-children carry-forward, and the
"During Campaign" working file) showed that almost the entire planning
package is **one calculation chain**: four registers feed a single per
team-per-day roll-up, and everything else (operational plan, logistics,
area summary) is a pure derivation of that roll-up, joined on
**team no. + campaign day**.

This app keeps that same shape:

```
INPUTS you actually type in:
  Schools (pages/schools.html)          → school_assignments
  MMP / CNIC contacts (pages/mmp.html)  → mmp_assignments
  House registration (pages/households.html)
  Missed children (pages/missed-children.html)

AUTO-GENERATED (no re-typing, ever):
  Team day plan (pages/team-plan.html)  ← a SQL VIEW (`team_day_plan`) that
                                            joins the four inputs above by
                                            team_no + campaign_day, the same
                                            way "Team Micro Plan Summaries"
                                            was built with SUMIFS in the
                                            source spreadsheets. Vaccine
                                            doses use the 1.11× wastage
                                            factor found in the source file.

DURING THE CAMPAIGN:
  Daily reports / 2A form (pages/daily-reports.html) — field actuals,
  recorded against the plan above.
```

See `Polio_Dashboard_Requirement_Map.md` (shared separately) for the full
sheet-by-sheet breakdown this was derived from, including four open
questions that still need your sign-off (a broken formula in the source
file, inconsistent capsule labeling, the missing DDM card template/PDFs,
and whether the Google Form and 2A form are both live data-entry channels).

## Project structure

```
index.html                   Login (Supabase email/password auth)
dashboard.html                KPI overview + campaign list
pages/
  campaigns.html               Create/list campaigns
  teams.html                   Staff master + team rosters
  schools.html                 School master + campaign team/day assignment
  mmp.html                     MMP/CNIC contact master + campaign assignment
  households.html               Door-to-door household census
  missed-children.html         Missed-children carry-forward register
  team-plan.html               ★ auto-generated plan (read-only)
  logistics.html                ★ auto-generated logistics needs (read-only)
  area-summary.html             ★ area-level grand totals + missed-children + field performance
  daily-reports.html            2A-form field actuals entry
  supervision.html              Tour plan / field validation / desk review entry
  ddm-cards.html                 ★ auto-generated DDM cards (placeholder layout — real template pending)
  audit-log.html                Read-only view of the DB-level audit trail
assets/
  css/style.css                 Shared design tokens/styles
  js/config.js                  Public Supabase URL + anon key
  js/supabaseClient.js          Client init + auth helpers
  js/nav.js                     Shared sidebar
  js/crud.js                    Shared form helpers (campaign dropdowns, UC lookup)
supabase/migrations/
  0001_initial_schema.sql       Version-controlled copy of the applied schema
```

## Database

19 tables + 4 views + 4 helper functions, all with RLS enabled and
role/UC-scoped as of migration `0004`. Schema in `supabase/migrations/`,
applied in order:

- `0001_initial_schema.sql` — the 19 base tables + `team_day_plan` (the core auto-generated roll-up)
- `0002_logistics_and_area_summary_views.sql` — `logistic_plan`, `area_incharge_summary`, `missed_children_status`
- `0003_audit_log_triggers.sql` — DB-level triggers that write to `audit_log` on every insert/update/delete to the operational tables (not app code — can't be bypassed)
- `0004_role_and_uc_scoped_rls.sql` — replaces the "any authenticated user" baseline policies with real scoping (see below)
- `0005_fix_helper_function_search_path.sql` — security-lint fix for the new helper functions
- `0006_ddm_cards_unique_constraint.sql` — one DDM card per team/day/campaign, enforced at the DB level

Key tables: `districts` → `tehsils` → `union_councils` (geography),
`staff`/`teams`/`team_members` (HR), `campaigns`, `schools` +
`school_assignments`, `mmp_contacts` + `mmp_assignments`, `households`,
`missed_children`, `daily_reports`, `supervision_visits`, `ddm_cards`,
`audit_log`.

### Access model

Every profile has a `role` and a `uc_id` (and, for coordinators, a
`district_id`):

| Role | Scope |
|---|---|
| `admin` | Everything, every UC |
| `district_coordinator` | Every UC within their `district_id` |
| `aic` | Read/write within their own `uc_id` |
| `encoder` | Read + operational-data entry (households, MMP, missed children, daily reports, school assignments) within their own `uc_id` — can't manage staff/teams/campaigns |
| `viewer` | Read-only within their own `uc_id` |

Geography tables (`districts`/`tehsils`/`union_councils`) are readable by
any signed-in user and open to insert (so a new campaign/school/team can
register a UC that doesn't exist yet) but only an `admin` can edit or
delete existing rows. `audit_log` is readable by `admin` and
`district_coordinator` only, and has no direct write policy for any
app role — only the database trigger (running as its owning role, which
bypasses RLS) can insert into it.

**First login:** a brand-new Supabase Auth user has no matching `profiles`
row yet, and under this RLS every UC-scoped table returns nothing until
one exists. `requireAuth()` in `assets/js/supabaseClient.js` checks for
this and redirects to `setup-profile.html`, where the user picks their
role and union council once; that single insert (allowed because
`id = auth.uid()`) is what unlocks everything else.

### Assumptions made in the Logistic Plan (need your sign-off)

The source spreadsheet's blue/red capsule and carrier/DDM-card formulas were
inconsistent between sheets (see the requirement map). To keep moving,
`logistic_plan` currently uses standard EPI field conventions instead:
**blue capsule → children under 12 months, red capsule → children 12–59
months**, **1 vaccine carrier + 4 ice packs per team/day**, **1 DDM card +
1 tally sheet per team/day**. Correct these in
`0002_logistics_and_area_summary_views.sql` (and re-apply via Supabase) once
you confirm the real rule.

## Setting up an account

Accounts are created in Supabase Auth (Authentication → Users) — no
self-service signup yet. The first time that person signs in, the app
sends them to `setup-profile.html` to pick their role and union council;
that's what determines what they can see (see "Access model" above). Make
the very first account an `admin` so someone can see everything while the
rest of the district's users and UCs get set up.

## Deploying

This is a static site — enable GitHub Pages on this repo (Settings → Pages
→ Deploy from branch → `main` / root) and it's live. No build step.

## Not built yet (next steps)

- DDM card's *real* layout — `pages/ddm-cards.html` generates and assigns one card per team/day already, but the visual design is a placeholder until you share the actual template
- Excel/PDF export matching the original report formats
- Confirm the Logistic Plan assumptions above and correct the migration if needed
- An admin UI for editing other users' profiles/roles (currently only doable directly in Supabase, or by the user themselves on first login)
