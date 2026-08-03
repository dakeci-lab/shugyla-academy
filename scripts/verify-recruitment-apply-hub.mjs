/**
 * Static verify: Stage 4 /apply hub + permanent store QR.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const checks = []
function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) })
  if (!condition) console.error(`FAIL: ${name}`)
  else console.log(`OK: ${name}`)
}

const app = read('src/App.jsx')
const authRoutes = read('src/router/authRoutes.js')
const hub = read('src/pages/ApplyHub.jsx')
const apply = read('src/pages/Apply.jsx')
const service = read('src/services/publicApplyVacanciesService.js')
const migration = read(
  'supabase/migrations/20260803180000_list_published_vacancies_for_apply.sql'
)
const vacanciesSection = read('src/components/admin/sections/VacanciesSection.jsx')
const qrModal = read('src/components/admin/ApplyHubQrModal.jsx')
const recruitmentData = read('src/utils/recruitmentData.js')
const basename = read('src/router/basename.js')
const pkg = read('package.json')

const applyRouteIdx = app.indexOf('path="/apply"')
const slugRouteIdx = app.indexOf('path="/apply/:slug"')
assert('/apply route registered', applyRouteIdx !== -1)
assert('/apply/:slug still registered', slugRouteIdx !== -1)
assert('/apply declared before /apply/:slug', applyRouteIdx !== -1 && applyRouteIdx < slugRouteIdx)
assert('/apply is public path', authRoutes.includes("'/apply'"))
assert('hub uses lightweight RPC service', hub.includes('fetchPublishedVacanciesForApply'))
assert(
  'hub empty state copy',
  hub.includes('careersEmptyTitle') || hub.includes('Сейчас открытых вакансий нет')
)
assert('hub no employee_role UI', !hub.includes('employee_role') && !hub.includes('employeeRole'))
assert('hub no other-position option', !hub.includes('Другая должность'))
assert('service uses list RPC', service.includes("rpc('list_published_vacancies_for_apply')"))
assert('migration whitelist only', migration.includes('returns table') && !migration.includes('select *'))
assert('migration joins active positions', migration.includes('p.is_active = true'))
assert('migration grants execute to anon', migration.includes('to anon'))
assert(
  'Apply links back to /apply hub',
  apply.includes('hubPath') &&
    (apply.includes('careersBackToVacancies') || apply.includes('Все вакансии'))
)
assert(
  'closed vacancy message',
  apply.includes('careersClosedTitle') || apply.includes('Эта вакансия больше недоступна')
)
assert('QR modal uses getApplyHubUrl', qrModal.includes('getApplyHubUrl'))
assert('QR URL is hub not slug vacancy', qrModal.includes("getApplyHubUrl('?source=store_qr')"))
assert('VacanciesSection has QR action', vacanciesSection.includes('Общий QR-код'))
assert('getApplyHubUrl uses getAppUrl', recruitmentData.includes('getApplyHubUrl') && basename.includes('getAppUrl'))
assert('qrcode dependency present', pkg.includes('"qrcode"'))
assert('no service_role in hub/service', !hub.includes('service_role') && !service.includes('service_role'))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
