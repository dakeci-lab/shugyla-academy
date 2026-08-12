#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(name, condition) {
  if (!condition) throw new Error(name)
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('=== Host-aware production surfaces verification ===\n')

const vite = read('vite.config.js')
const index = read('index.html')
const manifest = read('public/manifest.webmanifest')
const serviceWorker = read('public/sw.js')
const htaccess = read('public/.htaccess')
const legacyPagesWorkflow = path.join(ROOT, '.github/workflows/main.yml')
const psWorkflow = read('.github/workflows/deploy-ps-production.yml')
const e2eEnvironment = read('tests/e2e/helpers/env.mjs')
const hostSurface = read('src/router/hostSurface.js')
const main = read('src/main.jsx')
const app = read('src/App.jsx')
const corporateHome = read('src/pages/CorporateHome.jsx')
const recruitmentData = read('src/utils/recruitmentData.js')
const qrModal = read('src/components/admin/ApplyHubQrModal.jsx')
const stagingWorkflow = read('.github/workflows/e2e-recruitment-staging.yml')
const { isProductionAppUrl } = await import('../tests/e2e/helpers/env.mjs')

function loadNotificationNormalizer(scope) {
  const scopeUrl = new URL(scope)
  const context = {
    URL,
    self: {
      registration: { scope },
      location: { origin: scopeUrl.origin, hostname: scopeUrl.hostname },
      addEventListener() {},
    },
    caches: {},
  }
  vm.createContext(context)
  vm.runInContext(
    `${serviceWorker}\nglobalThis.__normalizeNotificationDestination = normalizeNotificationDestination`,
    context
  )
  return context.__normalizeNotificationDestination
}

assert('build base is configurable', vite.includes('APP_BASE_PATH'))
assert('GitHub Pages remains the default build fallback', vite.includes("'/shugyla-academy/'"))
assert('HTML assets use Vite base', index.includes('%BASE_URL%manifest.webmanifest'))
assert(
  'public hosts replace platform document metadata',
  index.includes("host === 'shugyla-market.kz'") &&
    index.includes("host === 'jobs.shugyla-market.kz'") &&
    index.includes("manifest?.remove()")
)
assert(
  'platform PWA is disabled on corporate and careers hosts',
  main.includes('platformPwaEnabled') &&
    main.includes('hostSurface === HOST_SURFACE.PLATFORM') &&
    main.includes('hostSurface === HOST_SURFACE.COMBINED')
)
assert('manifest start URL is deployment-relative', manifest.includes('"start_url": "./"'))
assert('manifest scope is deployment-relative', manifest.includes('"scope": "./"'))
assert('Service Worker derives its own scope', serviceWorker.includes('self.registration.scope'))
assert('Service Worker cache is migration version', serviceWorker.includes('shugyla-academy-shell-v7'))
assert('PWA icons avoid the reserved server path', manifest.includes('pwa-icons/icon-192.png'))
assert('Plesk has SPA fallback', htaccess.includes('RewriteRule ^ index.html [L]'))
assert('Plesk serves the manifest MIME type', htaccess.includes('application/manifest+json'))
assert('www redirects to canonical domain', htaccess.includes('https://shugyla-market.kz'))
assert('careers origin is configurable', hostSurface.includes('VITE_CAREERS_ORIGIN'))
assert(
  'careers production default is jobs host',
  hostSurface.includes("DEFAULT_CAREERS_ORIGIN = 'https://jobs.shugyla-market.kz'")
)
assert(
  'host classifier knows all production surfaces',
  hostSurface.includes("'shugyla-market.kz'") &&
    hostSurface.includes("'web.shugyla-market.kz'") &&
    hostSurface.includes("'jobs.shugyla-market.kz'")
)
assert(
  'localhost and legacy Pages keep combined mode',
  hostSurface.includes("'localhost'") && hostSurface.includes("'dakeci-lab.github.io'")
)
assert('root corporate placeholder is routed', app.includes('<CorporateHome />'))
assert('corporate placeholder links to careers', corporateHome.includes('getCareersUrl'))
assert(
  'web and root careers routes use external redirect',
  app.includes('CareersExternalRedirect')
)
assert(
  'jobs blocks internal routes',
  app.includes('surface === HOST_SURFACE.CAREERS') && app.includes('internalElement')
)
assert('apply URL helpers use canonical careers utility', recruitmentData.includes('getCareersUrl'))
assert(
  'QR keeps store source on canonical hub',
  qrModal.includes("getApplyHubUrl('?source=store_qr')")
)
assert('legacy GitHub Pages workflow stays removed', !fs.existsSync(legacyPagesWorkflow))
assert('PS.kz build targets domain root', psWorkflow.includes('APP_BASE_PATH: /'))
assert(
  'Plesk build pins canonical careers origin',
  psWorkflow.includes('VITE_CAREERS_ORIGIN: https://jobs.shugyla-market.kz')
)
assert('PS.kz artifact is isolated on its own branch', psWorkflow.includes('ps-production'))
assert('old production URL is protected from mutating E2E', e2eEnvironment.includes('dakeci-lab.github.io'))
assert('web production URL is protected from mutating E2E', e2eEnvironment.includes('web.shugyla-market.kz'))
assert('jobs production URL is protected from mutating E2E', e2eEnvironment.includes('jobs.shugyla-market.kz'))
assert('staging workflow blocks jobs production URL', stagingWorkflow.includes('jobs\\.'))
assert(
  'old production route is detected at runtime',
  isProductionAppUrl('https://dakeci-lab.github.io/shugyla-academy/apply')
)
assert(
  'web production route is detected at runtime',
  isProductionAppUrl('https://web.shugyla-market.kz/platform')
)
assert(
  'jobs production route is detected at runtime',
  isProductionAppUrl('https://jobs.shugyla-market.kz/apply/kassir')
)
assert(
  'transition root route remains protected at runtime',
  isProductionAppUrl('https://shugyla-market.kz/platform')
)
assert(
  'unrelated staging host stays available for mutating E2E',
  !isProductionAppUrl('https://staging.example.kz/platform')
)

const normalizeWebNotification = loadNotificationNormalizer('https://web.shugyla-market.kz/')
const normalizeFallbackNotification = loadNotificationNormalizer(
  'https://dakeci-lab.github.io/shugyla-academy/'
)

assert(
  'web-domain push keeps an internal route',
  normalizeWebNotification('/platform/profile') === 'https://web.shugyla-market.kz/platform/profile'
)
assert(
  'fallback push prefixes the GitHub Pages scope',
  normalizeFallbackNotification('/platform/profile') ===
    'https://dakeci-lab.github.io/shugyla-academy/platform/profile'
)
assert(
  'legacy tracker push becomes canonical on the new domain',
  normalizeWebNotification('/shugyla-academy/platform/time-tracker') ===
    'https://web.shugyla-market.kz/platform'
)
assert(
  'external push destination is rejected',
  normalizeWebNotification('https://example.com/platform/profile') ===
    'https://web.shugyla-market.kz/platform'
)

console.log(`\nVerification completed (${passed}/${passed} tests, exit 0)\n`)
