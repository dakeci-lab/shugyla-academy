/**
 * Static verify: HR public apply + scoring removal invariants.
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

const adapter = read('src/services/recruitmentSupabaseAdapter.js')
const applyPage = read('src/pages/Apply.jsx')
const vacanciesSection = read('src/components/admin/sections/VacanciesSection.jsx')
const candidatesTable = read('src/components/hr/CandidatesTable.jsx')
const filters = read('src/components/hr/CandidateFiltersFields.jsx')
const recruitmentData = read('src/utils/recruitmentData.js')
const migration = read(
  'supabase/migrations/20260803120000_secure_recruitment_public_apply.sql'
)

assert('submit uses RPC', adapter.includes("supabase.rpc('submit_candidate_application'"))
assert('adapter does not call evaluateCandidateScreening', !adapter.includes('evaluateCandidateScreening'))
assert('Apply has no filter-questions UI', !applyPage.includes('Фильтр-вопросы'))
assert('Apply uses toUserErrorMessage', applyPage.includes('toUserErrorMessage'))
assert(
  'VacanciesSection has no scoring UI',
  !vacanciesSection.includes('Проходной') &&
    !vacanciesSection.includes('passing_score') &&
    !vacanciesSection.includes('Балл')
)
assert(
  'VacanciesSection uses flexible form editor',
  vacanciesSection.includes('VacancyQuestionEditor')
)
const questionEditor = read('src/components/admin/VacancyQuestionEditor.jsx')
assert('Question editor has no score pairs', !questionEditor.includes('optionPairs') && !questionEditor.includes('score:'))
assert('Question editor has no filter-test copy', !questionEditor.includes('Фильтр-вопросы'))
assert('CandidatesTable has no Результат column', !candidatesTable.includes('Результат'))
assert('Filters have no score select', !filters.includes('SCORE_FILTER') && !filters.includes('Результат'))
assert('SCORE_FILTER_OPTIONS removed', !recruitmentData.includes('SCORE_FILTER_OPTIONS'))
assert('evaluateCandidateScreening removed', !recruitmentData.includes('evaluateCandidateScreening'))
assert('migration defines submit RPC', migration.includes('submit_candidate_application'))
assert('migration drops open candidates policy', migration.includes('Allow anon read write academy_candidates'))
assert('migration adds employee_role', migration.includes('add column if not exists employee_role'))
assert('migration repairs rejected no-test', migration.includes("status = 'new'"))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
