/**
 * Static verify: public recruitment routes are outside PlatformData boundary.
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
const internalProviders = read('src/components/platform/InternalPlatformProviders.jsx')
const applyHub = read('src/pages/ApplyHub.jsx')
const apply = read('src/pages/Apply.jsx')
const vacanciesPage = read('src/pages/VacanciesPage.jsx')
const vacancyDetail = read('src/pages/VacancyDetailPage.jsx')
const publicList = read('src/services/publicApplyVacanciesService.js')
const publicForm = read('src/services/publicApplyFormService.js')
const publicSubmit = read('src/services/publicApplySubmitService.js')
const consoleGuard = read('tests/e2e/helpers/consoleGuard.mjs')
const e2eSpec = read('tests/e2e/recruitment-flexible-form.spec.mjs')
const platformDataSvc = read('src/services/platformDataService.js')
const pkg = read('package.json')

assert(
  'App uses InternalPlatformProviders',
  app.includes('InternalPlatformProviders') &&
    internalProviders.includes('PlatformDataProvider')
)
assert(
  'PlatformDataProvider is not wrapping all Routes',
  !app.includes('<PlatformDataProvider>') &&
    app.includes('<InternalPlatformProviders>')
)
assert(
  'PermissionProvider not global in App',
  !app.includes('PermissionProvider')
)
assert(
  'NotificationInboxProvider not global in App',
  !app.includes('NotificationInboxProvider')
)
assert(
  'Internal providers wrap /platform route',
  app.includes('path="/platform"') &&
    app.indexOf('InternalPlatformProviders') < app.indexOf('path="hr/vacancies"')
)
assert(
  '/apply registered as public element',
  app.includes('path="/apply"') && app.includes('<ApplyHubPage')
)
assert(
  'ApplyHub uses public list service',
  applyHub.includes('fetchPublishedVacanciesForApply') &&
    !applyHub.includes('PlatformData') &&
    !applyHub.includes('usePlatformData') &&
    !applyHub.includes('fetchRecruitmentData')
)
assert(
  'Apply uses public form + submit services',
  apply.includes('fetchPublicVacancyApplicationForm') &&
    apply.includes('submitPublicCandidateApplication') &&
    !apply.includes('platformDataService') &&
    !apply.includes('fetchRecruitmentData') &&
    !apply.includes('usePlatformData')
)
assert(
  'VacanciesPage is redirect-only compatibility alias',
  vacanciesPage.includes('CareersHomeRedirect') &&
    !vacanciesPage.includes('fetchPublishedVacanciesForApply') &&
    !vacanciesPage.includes('platformDataService')
)
assert(
  'VacancyDetailPage uses public list service',
  vacancyDetail.includes('fetchPublishedVacanciesForApply') &&
    !vacancyDetail.includes('platformDataService')
)
assert(
  'public list service uses list RPC only',
  publicList.includes("rpc('list_published_vacancies_for_apply')") &&
    !publicList.includes('fetchRecruitmentData') &&
    !publicList.includes('academy_candidates')
)
assert(
  'public form service uses form RPC',
  publicForm.includes('get_public_vacancy_application_form') &&
    !publicForm.includes('fetchRecruitmentData')
)
assert(
  'public submit has no refreshData',
  publicSubmit.includes('submitCandidateApplication') &&
    !publicSubmit.includes('refreshData') &&
    !publicSubmit.includes('refreshRecruitmentData')
)
assert(
  'platform submitCandidateApplication has no refreshData',
  (() => {
    const idx = platformDataSvc.indexOf('export async function submitCandidateApplication')
    const next = platformDataSvc.indexOf('export async function updateCandidateStatus')
    const body = platformDataSvc.slice(idx, next)
    return body.includes('submitCandidateApplication') && !body.includes('refreshData')
  })()
)
assert(
  'getRouteCriticalModules does not match public /vacancies',
  platformDataSvc.includes("path.includes('/platform/hr')") &&
    !platformDataSvc.match(/path\.includes\('\/vacancies'\)/)
)
assert(
  'E2E removed PUBLIC_APPLY_ALLOW',
  !consoleGuard.includes('PUBLIC_APPLY_ALLOW') &&
    !e2eSpec.includes('PUBLIC_APPLY_ALLOW')
)
assert(
  'E2E keeps security probe allow separate',
  consoleGuard.includes('SECURITY_PROBE_ALLOW')
)
assert(
  'E2E uses public network guard',
  e2eSpec.includes('attachPublicNetworkGuard')
)
assert(
  'package.json has verify script',
  pkg.includes('verify:public-route-isolation')
)
assert(
  'App lazy-loads PlatformLayout',
  app.includes("lazy(() => import('./layouts/PlatformLayout'))")
)
assert(
  'App eager-loads ApplyHub (public)',
  app.includes("import ApplyHubPage from './pages/ApplyHub'")
)

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
