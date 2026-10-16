#!/usr/bin/env node
/**
 * Static verification of the stage 13d package (docs/db/stage-13d-personnel-tables-removal).
 * Guards the apply script: no CASCADE, only personnel tables, no kept table/function touched,
 * preflight/postcheck list the same 20 tables.
 *
 * Usage:
 *   npm run verify:stage-13d-personnel-removal-static
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = 'docs/db/stage-13d-personnel-tables-removal'
const read = (f) => fs.readFileSync(path.join(ROOT, DIR, f), 'utf8')
const apply = read('apply_13d_drop_personnel.sql')
const preflight = read('preflight.sql')
const postcheck = read('postcheck.sql')
const noComments = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const code = noComments(apply)

let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}

const tables = [
  'academy_employee_shifts', 'salary_records', 'salary_periods', 'salary_deductions', 'salary_allowances',
  'academy_candidates', 'academy_candidate_questions', 'academy_vacancies', 'academy_people',
  'recruitment_application_uploads', 'employee_documents', 'notifications', 'notification_deliveries',
  'notification_push_subscriptions', 'notification_preferences', 'notification_rules', 'notification_templates',
  'notification_test_send_permits', 'notification_test_broadcast_audits', 'platform_attendance_settings',
]
const kept = [
  'academy_users', 'roles', 'role_permissions', 'permissions', 'positions', 'position_groups',
  'platform_work_locations', 'user_table_settings', 'platform_suppliers', 'purchase_orders',
  'supplier_payment_obligations', 'invoke_procurement_sync_scheduler', 'invoke_procurement_archive_scheduler',
]

assert('runs in one transaction', /^\s*begin;/m.test(code) && /^\s*commit;/m.test(code))
assert('no CASCADE anywhere', !/\bcascade\b/i.test(code))
assert('no "if exists" (a wrong name must fail loudly)', !/if exists/i.test(code))
assert('no truncate / delete / update / alter', !/\b(truncate|delete\s+from|update\s+\w|alter)\b/i.test(code))
for (const t of tables) {
  assert(`apply drops public.${t}`, new RegExp(`public\\.${t}\\b`).test(code))
  assert(`preflight and postcheck list ${t}`, preflight.includes(`'${t}'`) && postcheck.includes(`'${t}'`))
}
for (const k of kept) assert(`apply never touches ${k}`, !new RegExp(`\\b${k}\\b`).test(code))
assert('apply drops only the time-tracker cron job',
  /cron\.unschedule\(jobid\) from cron\.job where jobname = 'time-tracker-notification-scheduler-every-minute'/.test(code) &&
  (code.match(/cron\.unschedule/g) || []).length === 1)
const fnCount = (code.match(/^drop function /gm) || []).length
assert(`drops exactly the 27 listed functions (found ${fnCount})`, fnCount === 27)
assert('README marks the stage as applied', /APPLIED/.test(read("README.md")))

console.log(`\nOK — ${checks} checks`)
