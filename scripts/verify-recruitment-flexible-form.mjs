/**
 * Static verify: Stage 5 flexible vacancy application forms.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const checks = []
function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) })
  if (!condition) console.error(`FAIL: ${name}`)
  else console.log(`OK: ${name}`)
}

const apply = read('src/pages/Apply.jsx')
const editor = read('src/components/admin/VacancyQuestionEditor.jsx')
const formUtils = read('src/utils/applicationForm.js')
const adapter = read('src/services/recruitmentSupabaseAdapter.js')
const publicForm = read('src/services/publicApplyFormService.js')
const details = read('src/components/hr/candidate-details/CandidateDetailsModal.jsx')
const migA = read('supabase/migrations/20260803200000_flexible_application_form.sql')
const migB = read('supabase/migrations/20260803200100_flexible_application_form_rpcs.sql')

assert('Apply uses DynamicApplicationForm', apply.includes('DynamicApplicationForm'))
assert('Apply has no hardcoded Имя * field block', !apply.includes('Имя *'))
assert('Apply loads public form RPC service', apply.includes('fetchPublicVacancyApplicationForm'))
assert('Apply has no filter-questions UI', !apply.includes('Фильтр-вопросы'))
assert('Apply has no Без теста', !apply.includes('Без теста'))

assert('Editor supports question types', formUtils.includes('single_choice') && formUtils.includes('multi_choice'))
assert('Protected bindings defined', formUtils.includes("first_name") && formUtils.includes("phone"))
assert('Editor has no scoring pairs', !editor.includes('optionPairs') && !editor.includes('score:'))
assert('Editor has preview', editor.includes('Предварительный просмотр'))
assert('Editor warns about new responses only', editor.includes('только к новым откликам'))
assert('Editor marks system fields', editor.includes('Системное поле'))

assert('Public form service uses RPC', publicForm.includes("get_public_vacancy_application_form"))
assert('Submit uses answers + form version', adapter.includes('p_answers') && adapter.includes('p_form_version'))
assert('Save form RPC wired', adapter.includes("save_vacancy_application_form"))
assert('Anon questions select removed from fetch path', adapter.includes('anon cannot SELECT questions'))

assert('Migration adds field_binding', migA.includes('field_binding'))
assert('Migration adds is_active', migA.includes('is_active'))
assert('Migration adds form version', migA.includes('application_form_version'))
assert('Migration seeds first_name/phone', migA.includes("'first_name'") && migA.includes("'phone'"))
assert('Migration no score UI values for options', !migA.includes('passing_score'))

assert('Public form RPC whitelist', migB.includes('get_public_vacancy_application_form') && migB.includes("'label', q.question_text"))
assert('Public form omits field_binding', !/get_public_vacancy_application_form[\s\S]*field_binding/.test(migB.split('save_vacancy_application_form')[0]))
assert('Submit validates unknown question', migB.includes('unknown_question'))
assert('Submit validates invalid option', migB.includes('invalid_option'))
assert('Submit checks form_outdated', migB.includes('form_outdated'))
assert('Submit stores snapshot version 2', migB.includes("'version', 2"))
assert('Submit status new', migB.includes("'new'"))
assert('Publish trigger validates form', migB.includes('academy_vacancies_validate_publish'))
assert('Anon questions policy dropped', migB.includes('academy_candidate_questions_anon_select_published'))

assert('Candidate details shows Ответы анкеты', details.includes('Ответы анкеты'))
assert('Snapshot reader exists', formUtils.includes('getCandidateAnswerDisplayRows'))
assert('Dynamic form component exists', existsSync(resolve(root, 'src/components/apply/DynamicApplicationForm.jsx')))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
