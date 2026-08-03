# Backup instructions (Stage 7A — not yet executed)

Backup was **not** created: no production `DATABASE_URL` / linked CLI / service-role dump access in this environment.

Store the archive **outside** the git repo, e.g.:

```text
~/.local/share/shugyla-academy/backups/academy-learning-YYYYMMDD/
```

or under already-ignored `.local-secrets/academy-learning-backups/` (never commit).

## Preferred: `pg_dump` (schema + data)

Requires production Postgres connection string (Dashboard → Database → Connection string).

```bash
export BACKUP_DIR="$HOME/.local/share/shugyla-academy/backups/academy-learning-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

# Replace with production URI (do not commit)
export DATABASE_URL='postgresql://postgres.***:***@aws-0-….pooler.supabase.com:5432/postgres'

TABLES=(
  academy_test_attempts
  academy_test_questions
  academy_tests
  academy_user_learning_paths
  academy_learning_path_courses
  academy_learning_paths
  academy_progress
  academy_course_assignments
  academy_lessons
  academy_courses
)

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  $(printf -- '-t public.%s ' "${TABLES[@]}") \
  -f "$BACKUP_DIR/learning-tables.pgdump"

# Permissions snapshot (exact codes only)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\\copy (
  select p.*
  from public.permissions p
  where p.code in (
    'academy.view','academy.manage_courses','academy.assign_courses',
    'academy.manage','academy.assign'
  )
) to '$BACKUP_DIR/learning-permissions.csv' csv header"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "\\copy (
  select rp.*
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id
  where p.code in (
    'academy.view','academy.manage_courses','academy.assign_courses',
    'academy.manage','academy.assign'
  )
) to '$BACKUP_DIR/learning-role-permissions.csv' csv header"

# Schema helpers
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/db/stage-7a-academy-learning-removal/preflight.sql \
  > "$BACKUP_DIR/preflight-before.txt"

shasum -a 256 "$BACKUP_DIR"/* > "$BACKUP_DIR/SHA256SUMS"
du -sh "$BACKUP_DIR"
```

## Restore sketch

```bash
pg_restore --no-owner --no-privileges -d "$DATABASE_URL" "$BACKUP_DIR/learning-tables.pgdump"
# Then re-import permission CSVs / re-run role_permissions inserts carefully (avoid duplicates).
```

## Verify

1. `pg_restore -l learning-tables.pgdump` lists all 10 tables.
2. SHA-256 matches `SHA256SUMS`.
3. Preflight row counts match REST/SQL counts recorded in `manifest.json` (after SQL access).
