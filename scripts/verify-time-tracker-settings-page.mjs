#!/usr/bin/env node
/**
 * Verification for simplified time-tracker settings page.
 *
 * Usage:
 *   npm run verify:time-tracker-settings-page
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

function main() {
  console.log('=== Time tracker settings page verification ===\n')

  const nav = read('src/platform/platformNav.js')
  const page = read('src/pages/platform/PlatformSettingsGeneral.jsx')
  const panel = read('src/components/admin/AttendanceSettingsPanel.jsx')

  console.log('Stage 1: Naming')
  assert('nav label renamed', nav.includes("label: 'Управление тайм-трекером'"))
  assert('nav title renamed', nav.includes("title: 'Управление тайм-трекером'"))
  assert('old general label removed from nav', !nav.includes("label: 'Общие настройки'"))
  assert('old general title removed from nav', !nav.includes("title: 'Общие настройки'"))

  console.log('Stage 2: Removed blocks')
  assert('page has no Режим работы', !page.includes('Режим работы'))
  assert('page has no Платформа section', !page.includes('Платформа'))
  assert('page has no DataModeBadge', !page.includes('DataModeBadge'))
  assert('page has no MigrateToCloudPanel', !page.includes('MigrateToCloudPanel'))
  assert('panel has no tabs', !panel.includes('attendance-settings-tabs') && !panel.includes('TABS'))
  assert('panel has no Правила отметки', !panel.includes('Правила отметки'))
  assert('panel has no tab state', !panel.includes("useState('location')") && !panel.includes('setTab'))

  console.log('Stage 3: Two cards')
  assert('Рабочая территория card', panel.includes('Рабочая территория'))
  assert('Штрафные баллы card', panel.includes('Штрафные баллы'))
  assert('location save retained', panel.includes('saveWorkLocation') && panel.includes('handleSaveLocation'))
  assert('penalties save retained', panel.includes('saveAttendanceSettings') && panel.includes('handleSaveSettings'))
  assert('geolocation retained', panel.includes('useCurrentLocation') && panel.includes('getCurrentPosition'))
  assert('page only renders panel', page.includes('<AttendanceSettingsPanel') && !page.includes('admin-panel-card'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
