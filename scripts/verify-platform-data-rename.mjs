#!/usr/bin/env node
/**
 * Stage 6 verification: Academy* platform infrastructure renamed to PlatformData*.
 *
 * Usage:
 *   npm run verify:platform-data-rename
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

function collectSourceFiles(dirRel) {
  const abs = path.join(ROOT, dirRel)
  const out = []
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        walk(full)
        continue
      }
      if (/\.(js|jsx|mjs|css)$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

function main() {
  console.log('=== Platform data infrastructure rename (Stage 6) ===\n')

  console.log('Files')
  assert('PlatformDataContext.jsx exists', exists('src/context/PlatformDataContext.jsx'))
  assert('PlatformDataContext.css exists', exists('src/context/PlatformDataContext.css'))
  assert('platformDataService.js exists', exists('src/services/platformDataService.js'))
  assert('legacy AcademyDataContext.jsx gone', !exists('src/context/AcademyDataContext.jsx'))
  assert('legacy AcademyDataContext.css gone', !exists('src/context/AcademyDataContext.css'))
  assert('legacy academyDataService.js gone', !exists('src/services/academyDataService.js'))

  console.log('\nSymbols')
  const ctx = read('src/context/PlatformDataContext.jsx')
  const app = read('src/App.jsx')
  assert('exports PlatformDataProvider', ctx.includes('export function PlatformDataProvider'))
  assert('exports usePlatformData', ctx.includes('export function usePlatformData'))
  assert('defines PlatformDataContext', ctx.includes('const PlatformDataContext = createContext'))
  assert('imports platformDataService', ctx.includes("from '../services/platformDataService'"))
  assert('imports PlatformDataContext.css', ctx.includes("./PlatformDataContext.css"))
  assert(
    'App mounts PlatformData via InternalPlatformProviders',
    app.includes('InternalPlatformProviders')
  )
  const internalProviders = read('src/components/platform/InternalPlatformProviders.jsx')
  assert(
    'InternalPlatformProviders order: PlatformData then Permission',
    (() => {
      const platform = internalProviders.indexOf('<PlatformDataProvider>')
      const permission = internalProviders.indexOf('<PermissionProvider>')
      return platform >= 0 && permission > platform
    })()
  )
  assert('App keeps SessionProvider above Router', (() => {
    const session = app.indexOf('<SessionProvider>')
    const router = app.indexOf('<BrowserRouter')
    return session >= 0 && router > session
  })())

  console.log('\nNo legacy infrastructure names in active src')
  const banned = [
    'AcademyDataProvider',
    'AcademyDataContext',
    'useAcademyData',
    'academyDataService',
    'AcademyDataContext.jsx',
    'AcademyDataContext.css',
    'academyDataService.js',
    'academy-data-loading',
  ]
  const srcFiles = collectSourceFiles('src')
  const hits = []
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, 'utf8')
    for (const token of banned) {
      if (text.includes(token)) hits.push(`${path.relative(ROOT, file)}:${token}`)
    }
  }
  assert('no banned legacy infra tokens in src', hits.length === 0, hits.slice(0, 20).join(', '))

  console.log('\nWorking consumers use usePlatformData')
  assert(
    'PlatformDashboard uses usePlatformData',
    read('src/pages/platform/PlatformDashboard.jsx').includes('usePlatformData'),
  )
  assert(
    'ProcurementPage uses usePlatformData',
    read('src/pages/platform/procurement/ProcurementPage.jsx').includes('usePlatformData'),
  )
  assert(
    'Standards page uses usePlatformData',
    read('src/pages/Standards.jsx').includes('usePlatformData'),
  )
  assert(
    'PlatformLayout uses usePlatformData',
    read('src/layouts/PlatformLayout.jsx').includes('usePlatformData'),
  )

  console.log('\nPreserved platform DB names and redirects')
  assert(
    'academy_users still referenced',
    read('src/services/rbacSupabaseAdapter.js').includes('academy_users') ||
      read('src/services/supabaseDataAdapter.js').includes('academy_users'),
  )
  assert('academy redirect preserved', app.includes('path="/academy"') || app.includes('path="academy/*"'))
  assert('standards.view still in catalog', read('src/config/permissionCatalog.js').includes('standards.view'))
  assert(
    'standards tables not renamed away',
    read('src/services/standardsSupabaseAdapter.js').includes('academy_standard') ||
      exists('src/services/standardsSupabaseAdapter.js'),
  )

  console.log('\nNo compatibility aliases')
  assert(
    'no AcademyDataProvider alias export',
    !ctx.includes('AcademyDataProvider = PlatformDataProvider') &&
      !ctx.includes('useAcademyData'),
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
