/**
 * Static verify: public careers layout, branding, E2E isolation.
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
const layout = read('src/layouts/CareersPublicLayout.jsx')
const header = read('src/components/careers/CareersHeader.jsx')
const hub = read('src/pages/ApplyHub.jsx')
const apply = read('src/pages/Apply.jsx')
const form = read('src/components/apply/DynamicApplicationForm.jsx')
const display = read('src/utils/careersVacancyDisplay.js')
const fixture = read('tests/e2e/helpers/fixture.mjs')
const setup = read('tests/e2e/global-setup.mjs')
const teardown = read('tests/e2e/global-teardown.mjs')
const smoke = read('tests/e2e/recruitment-production-smoke.spec.mjs')
const pkg = read('package.json')
const prodWorkflow = read('.github/workflows/e2e-recruitment-production.yml')
const stagingWorkflow = read('.github/workflows/e2e-recruitment-staging.yml')
const platformHeader = read('src/components/Header.jsx')

assert('CareersPublicLayout exists', layout.includes('CareersHeader') && layout.includes('Outlet'))
assert('App wraps careers routes in CareersPublicLayout', app.includes('CareersPublicLayout'))
assert('public routes nested under careers layout', app.includes('<Route element={<CareersPublicLayout />}>'))
assert('CareersHeader brands Shugyla Market', header.includes('Shugyla Market'))
assert('CareersHeader has no logout', !header.includes('Выйти') && !header.includes('logout'))
assert('CareersHeader has no useSession', !header.includes('useSession'))
assert('ApplyHub does not import platform Header', !hub.includes("from '../components/Header'"))
assert('Apply does not import platform Header', !apply.includes("from '../components/Header'"))
assert('ApplyHub has no Shugyla Platform', !hub.includes('Shugyla Platform'))
assert('Apply has no Shugyla Platform', !apply.includes('Shugyla Platform'))
assert('ApplyHub hero copy present', hub.includes('careersHeroTitle') && hub.includes('careersOpenTitle'))
assert('title/position dedupe helper', display.includes('getPublicVacancyDisplay'))
assert('ApplyHub uses display helper', hub.includes('getPublicVacancyDisplay'))
assert('form uses stacked label class', form.includes('apply-form__label') && form.includes('apply-form__control'))
assert('form labels not wrapping controls inline', !form.includes('<label className="admin-form__label" htmlFor={id}>\n                {label}\n                <textarea'))
assert('platform Header still says Platform', platformHeader.includes('Shugyla') && platformHeader.includes('Platform'))
assert('cleanup scans global leftovers', fixture.includes('countGlobalE2eLeftovers'))
assert('cleanup fails when leftovers remain', teardown.includes('cleanup incomplete') && teardown.includes('global'))
assert('mutating blocked on production Pages', setup.includes('E2E_ALLOW_PRODUCTION_MUTATING') && setup.includes('Mutating recruitment E2E is blocked'))
assert('smoke suite is non-destructive', smoke.includes('Does not create/publish') && smoke.includes('assertPublicShell'))
assert('package smoke/mutating scripts', pkg.includes('test:e2e:recruitment:smoke') && pkg.includes('test:e2e:recruitment:mutating'))
assert('default npm e2e is smoke', pkg.includes('"test:e2e:recruitment": "E2E_SUITE=smoke'))
assert('prod workflow uses smoke', prodWorkflow.includes('E2E_SUITE: smoke'))
assert('staging workflow refuses production URL', stagingWorkflow.includes('Refusing mutating suite against production'))

const failed = checks.filter((c) => !c.ok)
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
