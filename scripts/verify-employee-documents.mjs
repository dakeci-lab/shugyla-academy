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
  const adminMigration = read('supabase/migrations/20260901130000_employee_documents_admin_write_access.sql')
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
  assert('permission helper', migration.includes('current_user_has_permission'))

  console.log('\nStage 1b: Admin write access (owner reported: could not manage others\' documents)')
  assert(
    'insert/update RLS has employees.edit bypass (table)',
    adminMigration.includes('employee_documents_insert_own_or_admin') &&
      adminMigration.includes('employee_documents_update_own_or_admin') &&
      (adminMigration.match(/current_user_has_permission\('employees\.edit'\)/g) || []).length >= 4,
  )
  assert(
    'delete policy exists (table) — self or employees.edit',
    adminMigration.includes('employee_documents_delete_own_or_admin') &&
      adminMigration.includes('grant delete on table public.employee_documents'),
  )
  assert(
    'storage insert/update RLS has employees.edit bypass',
    (adminMigration.match(/employees\.edit/g) || []).length >= 6,
  )
  assert('storage delete policy exists', adminMigration.includes('employee_documents_storage_delete'))
  assert('delete service function exists', service.includes('export async function deleteEmployeeDocument'))
  assert(
    'page gates upload/delete on isOwn OR canEditEmployees, not isOwn alone',
    page.includes('canEditEmployees(user)') && !page.includes('const canUpload = isOwn'),
  )
  assert('delete button rendered when canManage', page.includes('onDeleteClick') && page.includes('Удалить'))

  console.log('\nStage 2: App wiring')
  assert('extensible document types', catalog.includes('identity_card') && catalog.includes('EMPLOYEE_DOCUMENT_TYPES'))
  assert('documents route', app.includes('employees/:employeeId/documents'))
  assert('documents page', page.includes('PlatformEmployeeDocuments') || page.includes('Документы'))
  assert('no duplicate page intro', !page.includes('employee-docs__header') && !page.includes('Загрузите документы'))
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
