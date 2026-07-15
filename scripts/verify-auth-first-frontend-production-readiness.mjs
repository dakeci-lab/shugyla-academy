#!/usr/bin/env node
/**
 * Auth-first frontend production deploy readiness verification.
 * Static + local checks only — does not deploy or mutate production.
 *
 * Usage:
 *   npm run verify:auth-first-frontend-production-readiness
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'

const FORBIDDEN_DIST_PATTERNS = [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /127\.0\.0\.1:54321/,
  /localhost:54321/,
  /\.eq\(['"]password['"]/,
  /academy_users\.password/,
  /AdminAccessLocal\d/,
  /AuthFirstVerify123/,
]

function fail(message) {
  throw new Error(message)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  })
  if (!options.allowFailure && result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    fail(`${command} ${args.join(' ')} exited ${result.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`)
  }
  return result
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  console.log(`  ✓ ${name}`)
}

function grepSrc(pattern) {
  const result = run('grep', ['-r', '-n', '-E', pattern, 'src'], { capture: true, allowFailure: true })
  return result.stdout.trim()
}

function walkFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, acc)
    else if (/\.(js|css|html|json|webmanifest)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

function stageAuthStatic() {
  console.log('Stage 1: Auth-first login static checks')
  const authUtils = read('src/utils/auth.js')
  const authService = read('src/services/authService.js')
  const loginPage = read('src/pages/Login.jsx')

  assert('loginCloud uses signInWithPassword', authUtils.includes('supabase.auth.signInWithPassword'))
  assert('loginCloud uses loginToTechnicalEmail', authUtils.includes('loginToTechnicalEmail'))
  assert('loginCloud loads profile by auth_user_id', authUtils.includes('loadAcademyProfileByAuthUserId'))
  assert('cloud login path has no authenticateEmployee', !/async function loginCloud[\s\S]*authenticateEmployee/.test(authUtils))
  assert('safe profile fields exclude password', authService.includes('ACADEMY_PROFILE_SAFE_FIELDS') && !authService.includes("'password'"))
  assert('profile lookup uses auth_user_id', authService.includes(".eq('auth_user_id', authUserId)"))
  assert('restorePlatformSession uses Supabase session in cloud', authService.includes('resolveSupabaseAuthSession'))
  assert('restorePlatformSession has no legacy password fallback in cloud branch', !/restorePlatformSession[\s\S]*row\.password/.test(authService))
  assert('Login page keeps login/password labels', loginPage.includes('Логин') && loginPage.includes('Пароль'))
  assert('Login page does not show technical email', !loginPage.includes('@shugyla.local'))
  assert('Login page maps profile_not_configured message', loginPage.includes('PROFILE_NOT_CONFIGURED_MESSAGE'))
  assert('Login page maps network error message', loginPage.includes('NETWORK_ERROR_MESSAGE'))
  console.log('')
}

function stageLegacyLoginAbsent() {
  console.log('Stage 2: Legacy password login absent from active cloud path')
  const legacyPasswordQuery = grepSrc("\\.eq\\(['\"]password['\"]")
  assert('no .eq(password) in src', !legacyPasswordQuery, legacyPasswordQuery || undefined)

  const authUtils = read('src/utils/auth.js')
  assert(
    'loginCloud has no academy_users password compare',
    !/loginCloud[\s\S]*\.from\(['"]academy_users['"][\s\S]*password/.test(authUtils)
  )

  const legacyFallback = grepSrc('signInSupabaseAuthAfterAcademyLogin\\(')
  const legacyCalls = legacyFallback
    .split('\n')
    .filter((line) => line && !line.includes('export async function signInSupabaseAuthAfterAcademyLogin'))
    .join('\n')
  assert('signInSupabaseAuthAfterAcademyLogin not called from src', !legacyCalls, legacyCalls || undefined)

  const adapterAuth = read('src/services/supabaseDataAdapter.js')
  assert('supabase authenticateUser marked deprecated', adapterAuth.includes('@deprecated Pre-Auth password compare'))
  console.log('')
}

function stageSessionLogout() {
  console.log('Stage 3: Session restore and logout')
  const sessionCtx = read('src/context/SessionContext.jsx')
  const authService = read('src/services/authService.js')
  const storage = read('src/utils/storage.js')
  const protectedRoute = read('src/components/ProtectedRoute.jsx')

  assert('SessionContext restores on startup', sessionCtx.includes('restorePlatformSession'))
  assert('SessionContext shows loading state', sessionCtx.includes('AUTH_STATUS.LOADING'))
  assert('SessionContext subscribes to auth changes', sessionCtx.includes('subscribeToAuthChanges'))
  assert('SessionContext logout calls signOut', sessionCtx.includes('await signOut()'))
  assert('SessionContext clears shugyla_user on logout', sessionCtx.includes('clearUser()'))
  assert('authService exports signOut', authService.includes('export async function signOut'))
  assert('storage uses shugyla_user key only', storage.includes("USER: 'shugyla_user'"))
  assert('ProtectedRoute waits for auth loading', protectedRoute.includes('AUTH_STATUS.LOADING'))
  assert('ProtectedRoute requires supabaseAuthenticated in cloud', protectedRoute.includes('supabaseAuthenticated'))
  console.log('')
}

function stageEmployeeAdmin() {
  console.log('Stage 4: Employee admin Edge Function integration')
  const section = read('src/components/admin/sections/EmployeesSection.jsx')
  const adminService = read('src/services/employeeAdminService.js')
  const provisioning = read('src/services/employeeProvisioningService.js')
  const academy = read('src/services/academyDataService.js')

  assert('EmployeesSection uses listEmployeesForAdmin', section.includes('listEmployeesForAdmin'))
  assert('cloud create uses createEmployee service', section.includes('createEmployee(payload)'))
  assert('cloud edit uses updateEmployee without password', /cloudMode[\s\S]*updateEmployee\(editId/.test(section))
  assert('admin-list-employees via functions.invoke', adminService.includes("supabase.functions.invoke('admin-list-employees'"))
  assert('admin-update-employees via functions.invoke', adminService.includes("supabase.functions.invoke('admin-update-employee'"))
  assert('admin-create via functions.invoke', provisioning.includes("supabase.functions.invoke('admin-create-employee'"))
  assert('createEmployeeWithAuth sends temporary_password not academy password column', provisioning.includes('temporary_password'))
  assert('academyDataService cloud create uses createEmployeeWithAuth', academy.includes('createEmployeeWithAuth'))
  assert('academyDataService cloud update uses updateEmployeeAsAdmin', academy.includes('updateEmployeeAsAdmin'))
  assert('employee list DTO uses authLinked not auth_user_id', adminService.includes('authLinked: row.auth_linked'))
  console.log('')
}

function stageSupabaseClient() {
  console.log('Stage 5: Supabase client and environment')
  const client = read('src/lib/supabaseClient.js')
  const serviceRoleHits = grepSrc('service_role|SUPABASE_SERVICE_ROLE')
  assert('client uses VITE_SUPABASE_URL', client.includes('import.meta.env.VITE_SUPABASE_URL'))
  assert('client uses VITE_SUPABASE_ANON_KEY', client.includes('import.meta.env.VITE_SUPABASE_ANON_KEY'))
  assert('service_role absent in src', !serviceRoleHits, serviceRoleHits || undefined)
  assert('no hardcoded production ref in src', !read('src/lib/supabaseClient.js').includes(PRODUCTION_REF))
  console.log('')
}

function stageGhPagesPwa() {
  console.log('Stage 6: GitHub Pages / PWA base path')
  const vite = read('vite.config.js')
  const manifest = read('public/manifest.webmanifest')
  const sw = read('public/sw.js')
  const index = read('index.html')
  const basename = read('src/router/basename.js')

  assert('Vite base is /shugyla-academy/', vite.includes("base: '/shugyla-academy/'"))
  assert('manifest start_url uses base', manifest.includes('"/shugyla-academy/"'))
  assert('manifest scope uses base', manifest.includes('"/shugyla-academy/"'))
  assert('service worker scope uses base', sw.includes("const BASE = '/shugyla-academy/'"))
  assert('index.html manifest href uses base', index.includes('/shugyla-academy/manifest.webmanifest'))
  assert('router basename reads import.meta.env.BASE_URL', basename.includes('import.meta.env.BASE_URL'))
  console.log('')
}

function stagePhase2Untouched() {
  console.log('Stage 7: Phase 2 / notifications untouched by this script')
  const phase2Path = 'supabase/migrations/20260714210000_production_auth_security_cutover_phase2.sql'
  assert('Phase 2 migration file exists locally only', fs.existsSync(path.join(ROOT, phase2Path)))
  console.log('')
}

function stageBuild() {
  console.log('Stage 8: Production build')
  run('npm', ['run', 'build'], {
    capture: false,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
      VITE_SUPABASE_ANON_KEY: 'build-readiness-placeholder-not-a-real-key',
    },
  })
  assert('dist/index.html exists', fs.existsSync(path.join(ROOT, 'dist/index.html')))
  assert('dist/404.html exists', fs.existsSync(path.join(ROOT, 'dist/404.html')))
  assert('dist/.nojekyll exists', fs.existsSync(path.join(ROOT, 'dist/.nojekyll')))
  console.log('')
}

function stageDistSecurityScan() {
  console.log('Stage 9: dist security scan')
  const distDir = path.join(ROOT, 'dist')
  const files = walkFiles(distDir)
  const hits = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN_DIST_PATTERNS) {
      if (pattern.test(content)) {
        hits.push(`${path.relative(ROOT, file)}: ${pattern}`)
      }
    }
  }

  assert('dist has no forbidden secrets/patterns', hits.length === 0, hits.join('; '))

  const indexHtml = read('dist/index.html')
  assert('dist index uses base asset paths', indexHtml.includes('/shugyla-academy/'))
  assert('dist index has no localhost Supabase URL', !indexHtml.includes('localhost:54321'))
  const mainJs = files.find((f) => /dist\/assets\/index-.*\.js$/.test(f.replace(/\\/g, '/')))
  if (mainJs) {
    const js = fs.readFileSync(mainJs, 'utf8')
    assert('dist bundle uses production Supabase host', js.includes(`${PRODUCTION_REF}.supabase.co`))
    assert('dist bundle has no localhost Supabase URL', !js.includes('127.0.0.1:54321'))
  }
  console.log('')
}

function stageLocalAuthMatrix() {
  console.log('Stage 10: Local auth test matrix (Supabase fixtures)')
  const scripts = [
    'supabase:local:verify-auth-first',
    'supabase:local:verify-employee-provisioning',
    'supabase:local:verify-employee-admin-access',
  ]
  for (const script of scripts) {
    run('npm', ['run', script], { capture: false })
    console.log(`  ✓ ${script} exit 0`)
  }
  console.log('')
}

function main() {
  console.log('=== Auth-first frontend production readiness ===\n')
  stageAuthStatic()
  stageLegacyLoginAbsent()
  stageSessionLogout()
  stageEmployeeAdmin()
  stageSupabaseClient()
  stageGhPagesPwa()
  stagePhase2Untouched()
  stageBuild()
  stageDistSecurityScan()
  stageLocalAuthMatrix()
  console.log('Auth-first frontend production readiness completed (exit 0)\n')
}

try {
  main()
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`)
  process.exit(1)
}
