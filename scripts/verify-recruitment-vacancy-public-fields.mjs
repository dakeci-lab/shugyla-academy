/**
 * Static verify: public vacancy facts, adapters, UI and security invariants.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const checks = []

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) })
  if (condition) console.log(`OK: ${name}`)
  else console.error(`FAIL: ${name}`)
}

const migration = read(
  'supabase/migrations/20260811163323_recruitment_vacancy_public_fields.sql'
)
const listFunction = migration.slice(
  migration.indexOf('create function public.list_published_vacancies_for_apply'),
  migration.indexOf('comment on function public.list_published_vacancies_for_apply')
)
const duplicateFunction = migration.slice(
  migration.indexOf('create or replace function public.duplicate_vacancy_with_application_form')
)
const fields = [
  'city',
  'store_name',
  'store_address',
  'salary_from',
  'salary_to',
  'salary_note',
  'schedule',
  'employment_type',
  'experience_requirement',
]

for (const field of fields) {
  assert(`migration adds ${field}`, migration.includes(`add column if not exists ${field}`))
  assert(`public list whitelists ${field}`, listFunction.includes(field))
  assert(`duplicate preserves ${field}`, duplicateFunction.includes(`v_source.${field}`))
}

assert('salary columns are nullable integers', /salary_from integer/.test(migration) && /salary_to integer/.test(migration))
assert('salary values cannot be negative', migration.includes('salary_from >= 0') && migration.includes('salary_to >= 0'))
assert('salary range is ordered', migration.includes('salary_to >= salary_from'))
assert('employment type is constrained', migration.includes("employment_type in ('full_time'"))
assert('experience requirement is constrained', migration.includes("experience_requirement in ('not_required'"))
assert('list RPC contains no select star', !/select\s+\*/i.test(listFunction))
assert('list RPC stays security definer', listFunction.includes('security definer'))
assert('list RPC grants execute to anon', migration.includes('to anon, authenticated, service_role'))
assert('migration creates no RLS policy', !/create\s+policy/i.test(migration))
assert('migration grants no table privileges', !/grant\s+(select|insert|update|delete|all)\s+on\s+table/i.test(migration))
assert('migration adds no permissive USING true', !/using\s*\(\s*true\s*\)/i.test(migration))
assert('candidate submit RPC is not replaced', !migration.includes('create or replace function public.submit_candidate_application'))
assert('photo RPCs are not replaced', !migration.includes('create_candidate_photo_upload_session'))

const normalized = read('src/utils/recruitmentData.js')
const supabaseAdapter = read('src/services/recruitmentSupabaseAdapter.js')
const localAdapter = read('src/services/recruitmentLocalAdapter.js')
const publicList = read('src/services/publicApplyVacanciesService.js')
const publicForm = read('src/services/publicApplyFormService.js')
const adminForm = read('src/components/admin/sections/VacanciesSection.jsx')
const adminShared = read('src/components/admin/sections/recruitmentAdminShared.js')
const hub = read('src/pages/ApplyHub.jsx')
const detail = read('src/pages/VacancyDetailPage.jsx')
const apply = read('src/pages/Apply.jsx')
const submitService = read('src/services/publicApplySubmitService.js')
const i18n = read('src/utils/i18n.js')

for (const camelField of [
  'city',
  'storeName',
  'storeAddress',
  'salaryFrom',
  'salaryTo',
  'salaryNote',
  'schedule',
  'employmentType',
  'experienceRequirement',
]) {
  assert(`normalizeVacancy maps ${camelField}`, normalized.includes(`${camelField}:`))
  assert(`Supabase adapter maps ${camelField}`, supabaseAdapter.includes(camelField))
  assert(`local adapter persists ${camelField}`, localAdapter.includes(camelField))
  assert(`public list maps ${camelField}`, publicList.includes(`${camelField}:`))
  assert(`public form maps ${camelField}`, publicForm.includes(`${camelField}:`))
  assert(`HR form contains ${camelField}`, adminForm.includes(`vacancyForm.${camelField}`))
  assert(`empty HR form contains ${camelField}`, adminShared.includes(`${camelField}:`))
}

assert('local vacancies preserve form version', localAdapter.includes('application_form_version: v.applicationFormVersion'))
assert('local questions preserve bindings', localAdapter.includes('field_binding: q.fieldBinding'))
assert('local questions preserve help and placeholder', localAdapter.includes('help_text: q.helpText') && localAdapter.includes('placeholder: q.placeholder'))
assert('local mock vacancies have positions', localAdapter.includes('position_id: cashierPositionId'))
assert('hub provides city filter only from vacancy data', hub.includes('cities.length > 1') && hub.includes('selectedCity'))
assert(
  'hub renders vacancy meta from public fields',
  hub.includes('getPublicVacancyDisplay') &&
    hub.includes('careers-vacancy-card') &&
    (hub.includes('employmentType') || hub.includes('getVacancyMetaParts'))
)
assert(
  'detail renders structured facts',
  detail.includes('getPublicVacancyFacts') &&
    (detail.includes('vacancy-detail__side-card') || detail.includes('vacancy-detail__facts'))
)
assert('consent is required client-side', apply.includes('careersConsent') && apply.includes('consentGiven') && apply.includes('required'))
assert('consent blocks submit', apply.includes('!consentGiven'))
assert('consent does not change submit service contract', !submitService.includes('consent'))
assert('photo is not automatically injected by public page', !apply.includes("questionType: 'photo'"))
assert('new public strings have RU and KZ entries', (i18n.match(/careersConsent:/g) || []).length === 2 && (i18n.match(/vacancySalary:/g) || []).length === 2)
assert('no service role in public clients', ![publicList, publicForm, apply, submitService].some((source) => source.includes('service_role')))

const failed = checks.filter((check) => !check.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
