#!/usr/bin/env node
/**
 * Verification: stage 12 — personnel modules are hidden, procurement/settlements stay.
 * Spec: docs/platform/stage-12-hide-personnel-modules.md
 *
 * Runs the real navigation/permission code (no regex-only checks for behavior):
 * every role lands on its first allowed section, hidden sections are gone from the
 * menu, retired routes redirect, careers site is retired.
 *
 * Usage:
 *   npm run verify:hide-personnel-modules
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0
function assert(name, condition) {
  if (!condition) throw new Error(name)
  checks += 1
  console.log(`  ✓ ${name}`)
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href)

const { PLATFORM_NAV } = await load('src/platform/platformNav.js')
const { getFirstAllowedPlatformPath } = await load('src/platform/platformBootstrap.js')
const { filterPlatformNav } = await load('src/config/permissions.js')

const flatIds = (nav) => nav.flatMap((i) => [i.id, ...(i.children || []).map((c) => c.id)])
const flatPaths = (nav) => nav.flatMap((i) => [i.path, ...(i.children || []).map((c) => c.path)]).filter(Boolean)

console.log('menu: hidden sections are gone, kept ones remain')
const ids = flatIds(PLATFORM_NAV)
for (const gone of ['home', 'employees', 'employees-list', 'employees-schedule', 'employees-payroll', 'hr',
  'settings-general', 'settings-notifications']) {
  assert(`menu has no "${gone}"`, !ids.includes(gone))
}
for (const kept of ['sales', 'procurement', 'orders', 'supplier-finance', 'finance-payment-accounts',
  'settings-users', 'settings-roles']) {
  assert(`menu keeps "${kept}"`, ids.includes(kept))
}
const sales = PLATFORM_NAV.find((i) => i.id === 'sales')
assert('sales is renamed «Главная»', sales.label === 'Главная' && sales.title === 'Главная')
assert('«Главная» is the first menu item', PLATFORM_NAV[0].id === 'sales')
assert('no menu path points at hidden modules',
  !flatPaths(PLATFORM_NAV).some((p) => /\/platform\/(hr|time-tracker|notifications)|employees\/(schedule|payroll)/.test(p)))

console.log('\nlanding: each role opens its first allowed section')
const land = (role) => getFirstAllowedPlatformPath({ role })
assert('admin lands on «Главная» (sales)', land('admin') === '/platform/sales')
assert('buyer lands on a procurement section', land('buyer') === '/platform/procurement')
assert('receiver lands on «Заказы»', land('receiver') === '/platform/orders')
for (const role of ['cashier', 'seller', 'floor_admin']) {
  const visible = filterPlatformNav(PLATFORM_NAV, { role })
  assert(`${role} has no sections → no-access page`, visible.length === 0 && !land(role))
}

console.log('\nrouting and providers')
const app = read('src/App.jsx')
for (const p of ['notifications', 'time-tracker', 'employees/*', 'hr/*', 'settings/general', 'settings/notifications']) {
  assert(`/platform/${p} redirects to the entry page`,
    new RegExp(`path="${p.replace('*', '\\*')}"[^]{0,160}?<Navigate`).test(app))
}
assert('/platform/employees/list redirects to settings/users',
  /path="employees\/list"[^]{0,80}<Navigate to="\/platform\/settings\/users"/.test(app))
assert('settings/users route is guarded by the employees-list permission',
  /path="settings\/users"[^]{0,140}ROUTE_KEYS\.EMPLOYEES_LIST/.test(app))
assert('hidden pages are no longer imported by App',
  !/PlatformPayroll|PlatformWorkSchedule|PlatformTimeTracker|PlatformHr(Vacancies|Candidates)|PlatformNotificationsInbox/.test(app))
assert('careers routes are retired', ['/vacancies', '/vacancies/:slug', '/apply', '/apply/:slug']
  .every((p) => app.includes(`path="${p}" element={<CareersRetiredRedirect />}`)))
const providers = read('src/components/platform/InternalPlatformProviders.jsx')
assert('notification inbox provider is not mounted', !/<NotificationInboxProvider/.test(providers))
const layout = read('src/layouts/PlatformLayout.jsx')
assert('layout mounts no device onboarding / permissions provider',
  !layout.includes('DeviceSetupOnboarding') && !layout.includes('<DevicePermissionsProvider'))
assert('header has no notification bell', !read('src/components/platform/PlatformHeaderActions.jsx').includes('NotificationBell'))
assert('corporate page has no vacancies link', !read('src/pages/CorporateHome.jsx').includes('corporateJobsLink'))

console.log('\ndata loading')
const svc = read('src/services/platformDataService.js')
assert('recruitment is not prefetched', /BACKGROUND_MODULES = \['suppliers'\]/.test(svc))
assert('only settings/users needs the employees module',
  svc.includes("path.includes('/platform/settings/users')") && !svc.includes("path === '/platform' || path === '/platform/'"))
assert('full reload does not fetch recruitment',
  !/fetchRecruitmentModuleData\(\),\n/.test(read('src/services/supabaseDataAdapter.js').split('export async function fetchAllData')[1]))

console.log('\nusers screen keeps working without the removed profile page')
const employees = read('src/components/admin/sections/EmployeesSection.jsx')
assert('users list does not link to the hidden employee profile', !employees.includes('/platform/employees/${employee.id}'))
assert('users list has no «create from candidate» flow (stage 14)',
  !/createFromCandidate|sourceCandidateId|candidatePhone/.test(employees) &&
  !/sourceCandidateId|candidatePhone/.test(read('src/components/admin/employees/EmployeeEditModal.jsx')))

console.log(`\nOK — ${checks} checks`)
