# Stage 7A–7B — Academy Learning DB removal

**Status:** **Stage 7B APPLIED** on production `cxadzerxndlscwvdaymk` (see `STAGE-7B-APPLY-REPORT.md`).  
Backup retained **outside Git** at `~/secure-backups/shugyla-platform/20260802T231625Z/`.

Do **not** re-apply DROP. Do **not** put these SQL files into `supabase/migrations/` unless an explicit historical migration is requested separately.

| File | Purpose |
|---|---|
| `BACKUP-RECORD.md` | Offline backup path + SHA-256 (no dump contents) |
| `AUDIT-NOTES.md` | Stage 7A read-only audit notes |
| `preflight.sql` | Read-only checks before DROP |
| `postcheck.sql` | Read-only checks after DROP |
| `drop_academy_learning.sql.draft` | Destructive draft (superseded by apply script) |
| `apply_7b_drop_academy_learning.sql` | Applied Stage 7B script (no `CASCADE`) |
| `rollback_academy_learning.sql.draft` | Restore sketch from verified backup |
| `backup-instructions.md` | Generic dump instructions (placeholders only) |
| `manifest.json` | Inventory + applied verdict |
| `STAGE-7B-APPLY-REPORT.md` | Apply + postcheck + smoke record |

GitHub Actions deploy frontend only; they do **not** run Supabase migrations.
