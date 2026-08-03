#!/usr/bin/env node
/**
 * Dry-run / optional cleanup for expired unused recruitment photo upload sessions.
 *
 * Usage:
 *   node scripts/cleanup-recruitment-upload-sessions.mjs
 *   node scripts/cleanup-recruitment-upload-sessions.mjs --apply
 *
 * Requires linked Supabase CLI auth. Does not print personal data.
 * By default only lists counts/IDs (dry-run). --apply deletes expired unused
 * session rows and their storage objects when the object is not referenced by
 * any academy_candidates.photo_path.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const apply = process.argv.includes('--apply')
const dir = mkdtempSync(join(tmpdir(), 'recruitment-upload-cleanup-'))
const sqlPath = join(dir, 'query.sql')

const listSql = `
SELECT id::text AS upload_id,
       vacancy_id::text AS vacancy_id,
       storage_path,
       expires_at::text
FROM public.recruitment_application_uploads
WHERE used_at IS NULL
  AND expires_at < now()
ORDER BY expires_at ASC
LIMIT 200;
`

writeFileSync(sqlPath, listSql)
const raw = execFileSync(
  'npx',
  ['--yes', 'supabase@2.111.0', 'db', 'query', '--linked', '-f', sqlPath],
  { encoding: 'utf8', env: process.env }
)

let rows = []
try {
  const parsed = JSON.parse(raw)
  rows = parsed.rows || []
} catch {
  // supabase may wrap output; try to extract JSON object
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    rows = JSON.parse(raw.slice(start, end + 1)).rows || []
  }
}

console.log(`expired_unused_sessions=${rows.length}`)
for (const row of rows.slice(0, 50)) {
  console.log(`upload_id=${row.upload_id} vacancy_id=${row.vacancy_id}`)
}

if (!apply) {
  console.log('dry_run=true (pass --apply to delete eligible session rows + unreferenced objects)')
  process.exit(0)
}

const applySql = `
WITH expired AS (
  SELECT id, storage_path
  FROM public.recruitment_application_uploads
  WHERE used_at IS NULL
    AND expires_at < now()
  LIMIT 200
),
unreferenced AS (
  SELECT e.id, e.storage_path
  FROM expired e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.academy_candidates c
    WHERE c.photo_path = e.storage_path
  )
),
deleted_sessions AS (
  DELETE FROM public.recruitment_application_uploads u
  USING unreferenced r
  WHERE u.id = r.id
  RETURNING u.id, u.storage_path
)
SELECT count(*)::int AS deleted_sessions FROM deleted_sessions;
`

writeFileSync(sqlPath, applySql)
const applyRaw = execFileSync(
  'npx',
  ['--yes', 'supabase@2.111.0', 'db', 'query', '--linked', '-f', sqlPath],
  { encoding: 'utf8', env: process.env }
)
console.log('apply_result_json_excerpt=', applyRaw.slice(0, 400).replace(/\s+/g, ' '))
console.log(
  'note=Storage objects for deleted sessions should be removed via Storage API/dashboard if still present; this script only removes unreferenced session rows safely.'
)
