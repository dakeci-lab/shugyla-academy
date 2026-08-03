/**
 * Static verify: Stage 3 vacancy ↔ centralized positions linkage.
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

const migration = read('supabase/migrations/20260803160000_vacancy_position_link.sql')
const vacanciesSection = read('src/components/admin/sections/VacanciesSection.jsx')
const adapter = read('src/services/recruitmentSupabaseAdapter.js')
const platform = read('src/services/platformDataService.js')
const recruitmentData = read('src/utils/recruitmentData.js')
const employeesSection = read('src/components/admin/sections/EmployeesSection.jsx')
const applyPage = read('src/pages/Apply.jsx')
const positionService = read('src/services/positionCatalogService.js')

assert('migration adds position_id', migration.includes('add column if not exists position_id'))
assert('migration adds snapshot', migration.includes('position_name_snapshot'))
assert('migration FK references positions', migration.includes('references public.positions'))
assert('migration ON DELETE RESTRICT', migration.includes('on delete restrict'))
assert('migration no CASCADE', !/on delete cascade/i.test(migration))
assert('migration exact-match backfill', migration.includes('norm_name = v.norm_title'))
assert('VacanciesSection uses position catalog', vacanciesSection.includes('buildPositionSelectGroups'))
assert('VacanciesSection label Должность', vacanciesSection.includes('Должность'))
assert('no hardcoded VACANCY_ROLES select', !vacanciesSection.includes('VACANCY_ROLES'))
assert('createVacancy requires positionId', platform.includes("if (!vacancyData.positionId)"))
assert('adapter stores position_id', adapter.includes('position_id: data.positionId'))
assert(
  'HR embed positions; anon uses plain select',
  adapter.includes('positions(id, name, is_active, archived_at)') &&
    adapter.includes('Anon cannot SELECT positions')
)
assert('getVacancyPositionLabel exists', recruitmentData.includes('getVacancyPositionLabel'))
assert('Apply uses position label', applyPage.includes('getVacancyPositionLabel'))
assert('hire prefill uses vacancy.positionId', employeesSection.includes('vacancy.positionId'))
assert('archived position blocked for hire', employeesSection.includes('isPositionAssignable'))
assert('reuses positionCatalogService', positionService.includes('buildPositionSelectGroups'))
assert('no second position catalog file', !vacanciesSection.includes('VACANCY_POSITIONS'))
assert('RPC submit untouched for position injection', !adapter.includes('p_position_id'))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
