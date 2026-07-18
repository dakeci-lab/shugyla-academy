#!/usr/bin/env node
/**
 * Verification: employee documents module + notification prefs placement.
 *
 * Usage:
 *   npm run verify:employee-documents
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function main() {
  console.log('=== Employee documents verification ===\n')

  const migration = read('supabase/migrations/20260718240000_employee_documents.sql')
  const service = read('src/services/employeeDocumentService.js')
  const page = read('src/pages/platform/PlatformEmployeeDocuments.jsx')
  const catalog = read('src/utils/employeeDocuments.js')
  const header = read('src/components/admin/employees/EmployeeProfileHeader.jsx')
  const profile = read('src/pages/Profile.jsx')
  const inbox = read('src/pages/platform/PlatformNotificationsInbox.jsx')
  const panel = read('src/components/platform/notifications/NotificationPanel.jsx')
  const sidebar = read('src/components/platform/PlatformSidebar.jsx')
  const app = read('src/App.jsx')

  console.log('Stage 1: Schema / storage')
  assert('employee_documents table', migration.includes('create table if not exists public.employee_documents'))
  assert(
    'private bucket',
    migration.includes("'employee-documents'") &&
      (migration.includes('public = false') || migration.includes('public,\n  false') || migration.includes('false,'))
  )
  assert('RLS own or admin select', migration.includes('employee_documents_select_own_or_admin'))
  assert('no delete policy for documents table', !migration.includes('for delete'))
  assert('permission helper', migration.includes('current_user_has_permission'))

  console.log('\nStage 2: App wiring')
  assert('extensible document types', catalog.includes('identity_card') && catalog.includes('EMPLOYEE_DOCUMENT_TYPES'))
  assert('documents route', app.includes('employees/:employeeId/documents'))
  assert('documents page', page.includes('PlatformEmployeeDocuments') || page.includes('Документы'))
  assert('upload via storage', service.includes('EMPLOYEE_DOCUMENT_BUCKET') && service.includes('.upload('))
  assert('signed url view', service.includes('createSignedUrl'))
  assert('header documents button', header.includes('Документы') && header.includes('showDocuments'))
  assert('profile documents row', profile.includes('Документы') && !profile.includes('ProfileNotificationsModal'))

  console.log('\nStage 3: Notifications UX')
  assert('inbox has push toggle', inbox.includes('PushNotificationToggle'))
  assert('panel has push toggle', panel.includes('PushNotificationToggle'))
  assert('notifications nested under home', sidebar.includes('nestMobileNotificationsUnderHome'))
  assert('no separate notifications group insert', !sidebar.includes('insertMobileNotificationsItem'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
