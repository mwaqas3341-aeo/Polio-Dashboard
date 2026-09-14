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
  daily-reports.html            2A-form field actuals entry
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

19 tables + 1 view, all with RLS enabled (currently: any authenticated user
can read/write — tighten to role/UC-scoped policies once user roles are
assigned in `profiles`). Full schema in `supabase/migrations/0001_initial_schema.sql`.

Key tables: `districts` → `tehsils` → `union_councils` (geography),
`staff`/`teams`/`team_members` (HR), `campaigns`, `schools` +
`school_assignments`, `mmp_contacts` + `mmp_assignments`, `households`,
`missed_children`, `daily_reports`, `supervision_visits`, `ddm_cards`,
`audit_log`.

## Setting up an account

Accounts are created in Supabase Auth (Authentication → Users), then a
matching row is needed in `profiles` (full_name, role, uc_id) for the app to
show a name/role. No self-service signup yet — an admin creates accounts.

## Deploying

This is a static site — enable GitHub Pages on this repo (Settings → Pages
→ Deploy from branch → `main` / root) and it's live. No build step.

## Not built yet (next steps)

- Role/UC-scoped RLS policies (currently open to any authenticated user)
- DDM card generation/printing (needs the actual card template — not supplied yet)
- Logistic Plan page (vaccine doses/capsules/carriers — formula needs your
  sign-off on the blue/red capsule discrepancy noted in the requirement map)
- Area Incharge Summary roll-up page
- Excel/PDF export matching the original report formats
- Audit log UI (table exists; nothing writes to it yet)
- Supervision visit forms (Desk Review / Field Validation / Tour Plan)
