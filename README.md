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
index.html                   Login (CNIC or email + password, Supabase Auth)
change-password.html          Change your own password
setup-profile.html            First-login profile setup
dashboard.html                KPI overview + campaign list
pages/
  campaigns.html               Campaign Details: edit dates/days, live UC → AIC → team structure, saved rosters
  staff.html                   Staff Management: UCMO → AIC → teams → members, drivers, CNIC pictures/expiry, Team Adjustment + history
  operational-plan.html        Operational Plan: Mobile teams, Days 1–3, pictures, day maps, MMP list, automatic School List, Excel reports
  cnic-lists.html              CNIC lists (PDF): Area Incharges, Drivers, Team members by AIC and team; preview + download
  payments.html                Payment lists (EasyPaisa / JazzCash / IBAN) with Excel download
  staff-pdf.html               Team staff PDF with CNIC front/back at card size
  teams.html                   Old staff form (no longer in the menu; superseded by staff.html)
  schools.html                 School master + campaign team/day assignment
  mmp.html                     MMP/CNIC contact master + campaign assignment
  households.html               Door-to-door household census
  missed-children.html         Missed-children carry-forward register
  team-targets.html            ★ AIC sets the plan target here (households + children per team/day)
  team-plan.html                Register totals — reference only, not the target
  logistics.html                 Logistic plan, driven by your targets, not the register totals
  area-summary.html             Area-level grand totals + missed-children + field performance
  daily-reports.html            Quick data-entry table for field actuals, no roster/plan context
  two-a-form.html               ★ the actual 2A form: auto-fills header/roster/plan targets, then save + print
  supervision.html              Tour plan / field validation / desk review entry
  ddm-cards.html                 ★ auto-generated DDM cards (placeholder layout — real template pending)
  audit-log.html                Read-only view of the DB-level audit trail
assets/
  css/style.css                 Shared design tokens/styles
  js/config.js                  Public Supabase URL + anon key
  js/supabaseClient.js          Client init + auth helpers
  js/nav.js                     Shared sidebar
  js/crud.js                    Shared form helpers (campaign dropdowns, UC lookup)
  js/cnicpdf.js                 CNIC PDF layout (A4, cards at 85.6x54 mm proportion, front/back side by side)
  js/images.js                  Picture shrinking before upload
  js/validators.js              CNIC / mobile / IBAN (mod-97) validators, wallet and team-type lists
  js/export.js                  Shared Excel export (SheetJS) — used by team-plan/logistics/mmp/schools/area-summary
supabase/migrations/
  0001_initial_schema.sql       Version-controlled copy of the applied schema
```

## Database

Tables, views and helper functions, all with RLS enabled and
role/UC-scoped as of migration `0004`. Schema in `supabase/migrations/`,
applied in order:

- `0001_initial_schema.sql` — the 19 base tables + `team_day_plan` (the core auto-generated roll-up)
- `0002_logistics_and_area_summary_views.sql` — `logistic_plan`, `area_incharge_summary`, `missed_children_status`
- `0003_audit_log_triggers.sql` — DB-level triggers that write to `audit_log` on every insert/update/delete to the operational tables (not app code — can't be bypassed)
- `0004_role_and_uc_scoped_rls.sql` — replaces the "any authenticated user" baseline policies with real scoping (see below)
- `0005_fix_helper_function_search_path.sql` — security-lint fix for the new helper functions
- `0006_ddm_cards_unique_constraint.sql` — one DDM card per team/day/campaign, enforced at the DB level
- `0007_team_member_cnic_photos_and_numbering.sql` — adds `team_members.member_no` and `staff.cnic_pic_front_path`/`cnic_pic_back_path`
- `0008_staff_documents_storage_bucket.sql` — private Storage bucket for CNIC photos, scoped by UC via the object path
- `0009_team_targets_table.sql` — adds `team_targets` (the AIC's manually-set plan numbers) and rebuilds `logistic_plan`/`area_incharge_summary` to roll up from it instead of the auto-computed register totals
- `0010_include_school_and_mmp_in_targets.sql` — fixes a real gap: the register-totals reference never included MMP/HRMP counts, only School list + House registration. `team_targets` now has explicit `target_school_children`/`target_household_children`/`target_mmp_children` columns that always sum to `target_children` (a generated column), so none of the three can be silently left out

Phase 1 (Campaign Details + Staff Management), applied in order after `0010`:

- `0011_payment_details_and_member_history.sql` — payment wallet number/type and IBAN on staff; member start/end dates and reasons
- `0012_lock_role_escalation.sql` — closes a hole where any signed-in user could make themselves admin; only an admin can grant roles
- `0013_staff_hierarchy.sql` — designations (UCMO, AIC, team member, driver), AIC numbers, driver-to-AIC link, 2 members per team, one active team per person
- `0014_phase1_staff_banking_adjustments.sql` — `banks` list, IBAN checksum, bank/IBAN match, father name, staff statuses, AIC numbers 1–20, append-only `staff_adjustment_history`, `adjust_team_member()` (leave / reserve / transfer / replace / swap)
- `0015_team_type_mobile.sql` — team types are exactly fixed, transit, mobile
- `0016_uc_plan_and_roster_snapshots.sql` — `uc_plans` (planned AIC/team counts per UC) and `campaign_roster_snapshots` (frozen roster saved when a campaign is closed)
- `0017_edit_team_and_tighten.sql` — `update_team()`; roster snapshots limited to admin / district coordinator / UCMO; plan table audited
- `0018_cnic_expiry_and_required_pictures.sql` — CNIC expiry (or lifetime flag); the database refuses to put a person on a team without both CNIC pictures and a valid expiry
- `0019_planned_team_hint.sql` — remembers the team a person is expected to join, for one-click placement
- `0021`–`0022` — official designation / department / place of posting on staff; a team may exist before its type is set
- `0023_partial_data_allowed.sql` — partial records allowed (no CNIC pictures needed to save or to join a team); unanswered figures are NULL, not 0
- `0020_operational_plan.sql` — Operational Plan for Mobile teams (Days 1–3, doses = children × 1.11 kept by trigger), plan pictures, day maps, AIC Area Map, school/MMP totals, and the Missed Children gate before a campaign can be closed

Notes: staff, AICs and teams are permanent records that carry over between campaigns. A keep-alive ping runs inside Supabase
(`pg_cron` every 6 hours calling `public.heartbeat()`); `ops/heartbeat.yml` is an unused GitHub Actions alternative.
Account-holder name verification is **not** implemented — no verification service is connected, and the screen says so.

Key tables: `districts` → `tehsils` → `union_councils` (geography),
`staff` (now includes `cnic_pic_front_path`/`cnic_pic_back_path`) /`teams`/
`team_members` (now includes `member_no`, the roster position) (HR),
`campaigns`, `schools` + `school_assignments`, `mmp_contacts` +
`mmp_assignments`, `households`, `missed_children`, `daily_reports`,
`supervision_visits`, `ddm_cards`, `audit_log`.

**Storage:** a private `staff-documents` bucket holds CNIC front/back
photos, one object per staff member at `{uc_id}/{staff_id}/front.<ext>` /
`back.<ext>`. Storage policies mirror the same UC-scoping as the tables —
only someone whose `user_scope_uc_ids()` includes that UC can upload,
view, update, or delete a given photo. The app fetches images via short-
lived signed URLs (5 minutes), never a public link.

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

## Why targets are entered by hand, not auto-computed

Originally `team_day_plan` (summed live from the School list, House
registration, and MMP/CNIC inputs) was also used as *the* plan number. That's
now split in two, on request:

- **`team_targets`** — the Area Incharge's own number, typed in on
  `pages/team-targets.html`, the way it's done by hand when preparing a
  micro-plan. This is what the 2A form, Logistic Plan, and Area Incharge
  Summary use.
- **`team_day_plan`** (via `pages/team-plan.html`, now labeled "Register
  totals (reference)") — still computed live from the registers, but only
  as a cross-check while you're deciding a target, not the target itself.

`team_plan` is the view that joins the two: your target, plus the register
totals alongside for comparison.

**The target is always three explicit parts, not one blind number:**
`target_school_children` + `target_household_children` +
`target_mmp_children` = `target_children` (a generated column — you can't
enter a total that skips one of the three). `pages/team-targets.html` has a
"Pull reference numbers" button that fetches what's currently in the School
list, House registration, and MMP/CNIC list for that team/day and pre-fills
all three fields, so MMP/HRMP children specifically can't be forgotten —
you can still edit any of the three before saving if your own plan differs
from what's registered so far.

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
- The Excel exports (Team Micro Plan, Logistic Plan, CNIC List, School List, Area Incharge Summary) currently use plain generic headers/column order, not the exact sheet layout (merged headers, sheet name, row grouping) from your source files — I don't have those exact formats memorized cell-for-cell, so treat these as "the right numbers, generic layout" until you compare one against the original and tell me what to fix
- Confirm the Logistic Plan capsule/carrier assumptions above and correct the migration if needed
- An admin UI for editing other users' profiles/roles (currently only doable directly in Supabase, or by the user themselves on first login)
