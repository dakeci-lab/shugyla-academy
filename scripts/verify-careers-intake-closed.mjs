#!/usr/bin/env node
/**
 * Verification: the public careers intake is closed at the database level (stage 13a).
 * Static check of the migration; the live check is in docs/platform/stage-13-cleanup.md.
 *
 * Usage:
 *   npm run verify:careers-intake-closed
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = 'supabase/migrations/20261016200000_revoke_anon_careers_intake.sql'
const sql = fs.readFileSync(path.join(ROOT, file), 'utf8')
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}

const expected = [
  'submit_candidate_application(uuid, jsonb, integer, uuid, uuid)',
  'submit_candidate_application(uuid, jsonb, integer, uuid)',
  'create_candidate_photo_upload_session(uuid, integer, text)',
  'cancel_candidate_photo_upload_session(uuid)',
  'get_public_vacancy_application_form(text)',
  'list_published_vacancies_for_apply()',
]
for (const fn of expected) {
  assert(`revokes anon EXECUTE on ${fn}`, code.includes(`revoke execute on function public.${fn} from anon;`))
}
assert('only anon is revoked (authenticated/service_role untouched)',
  !/from\s+(authenticated|service_role|public)\b/i.test(code))
assert('no table or data changes', !/\b(drop|delete|truncate|alter|update|insert)\b/i.test(code))
assert('rollback is documented in the file', /Rollback[\s\S]*grant execute/.test(sql))

console.log(`\nOK — ${checks} checks`)
