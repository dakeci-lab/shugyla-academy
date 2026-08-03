# Stage 7B — Academy Learning removal applied

**Project:** `cxadzerxndlscwvdaymk`  
**Applied:** 2026-08-03 via `supabase db query --linked -f apply_7b_drop_academy_learning.sql`  
**Backup:** `~/secure-backups/shugyla-platform/20260802T231625Z/` (SHA-256 verified before apply; **not in Git**)  
**CASCADE:** not used  

## Preflight (immediate before apply)

| Check | Result |
|---|---|
| Counts | 7/36/1/0/1/2/0/1/2/0 (unchanged vs backup) |
| Inbound FK from non-learning | 0 |
| Permission codes | `academy.view`×7, `manage_courses`×1, `assign_courses`×1 |
| Preserve objects | users/shifts/HR/Standards/`academy_set_updated_at`/standards.* OK |
| Realtime learning | 0 |
| Owner confirmation | received (no external Academy consumers) |

## Postcheck

| Check | Result |
|---|---|
| Learning tables | absent (`to_regclass` all null) |
| Learning permissions | absent |
| Orphan `role_permissions` | 0 |
| `academy_users` / shifts / HR / Standards | present |
| `standards.view` / `standards.manage` | present |
| `academy_set_updated_at()` | present |
| Non-learning triggers on shared function | 31 |

## Authenticated smoke (production SPA)

Account: owner/admin session on `https://dakeci-lab.github.io/shugyla-academy/`.  
Session restore after reload: OK.

| Surface | Result |
|---|---|
| Login + session restore | OK → `/platform` |
| Home | OK (company health / attendance cards) |
| Employees list | OK (13 active rows) |
| Employee profile | OK (`/platform/employees/:id`) |
| Schedule | OK (week grid) |
| Time-tracker URL | intentional stub → `/platform` (`PlatformTimeTracker`) |
| Rating | OK |
| Procurement | OK |
| Receiving | OK |
| Suppliers | OK |
| Settlements | OK |
| Supplier payments | OK |
| Standards | OK |
| Roles & permissions | OK; learning codes not shown |

Absence checks during smoke:

- console errors related to learning: none observed  
- infinite boot loading: none  
- fetch to dropped Academy Learning tables: none  
- `relation does not exist`: none  
- legacy redirects: `/academy`, `/academy/courses`, `/admin/courses`, `/courses/:id`, `/admin/tests`, `/admin/progress` → `/platform`

Production DB was **not** modified during this smoke / documentation pass.
