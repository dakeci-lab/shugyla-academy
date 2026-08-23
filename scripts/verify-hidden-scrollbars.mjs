#!/usr/bin/env node
/**
 * Verification for global hidden scrollbars standard.
 *
 * Usage:
 *   npm run verify:hidden-scrollbars
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'src')

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

function walkCssFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkCssFiles(fullPath, files)
      continue
    }
    if (entry.name.endsWith('.css')) files.push(fullPath)
  }
  return files
}

function main() {
  console.log('=== Hidden scrollbars verification ===\n')

  const indexCss = read('src/index.css')
  const modalLock = read('src/utils/modalScrollLock.js')

  assert('index.css loaded from main entry', read('src/main.jsx').includes('./index.css'))
  assert('global UI standard comment present', indexCss.includes('Shugyla Platform UI standard'))
  assert('global scrollbar-width none', indexCss.includes('scrollbar-width: none'))
  assert('global ms overflow style none', indexCss.includes('-ms-overflow-style: none'))
  assert('global webkit scrollbar hidden', indexCss.includes('*::-webkit-scrollbar'))
  assert('no page level overflow-x hidden in index.css', !indexCss.match(/html,\s*\nbody,\s*\n#root[\s\S]*overflow-x:\s*hidden/))
  assert('no global overflow hidden on star selector', !indexCss.match(/\*\s*\{[^}]*overflow:\s*hidden/))

  assert('modal lock uses scrollbar width check', modalLock.includes('getScrollbarWidth()'))
  assert('modal lock padding only when width > 0', modalLock.match(/scrollbarWidth > 0[\s\S]*paddingRight/))

  // Owner-approved exception: the procurement planner table wants a persistent
  // scroll indicator (like UMAG's product grid), so it opts back into a visible
  // scrollbar. See the comment on this exception in src/index.css.
  const SCROLLBAR_EXCEPTIONS = new Set([
    'src/components/procurement/ProcurementPlannerView.css',
  ])

  const cssFiles = walkCssFiles(SRC)
  const offenders = []

  for (const filePath of cssFiles) {
    const rel = path.relative(ROOT, filePath)
    if (rel === 'src/index.css' || SCROLLBAR_EXCEPTIONS.has(rel)) continue
    const content = fs.readFileSync(filePath, 'utf8')

    if (/scrollbar-width:\s*(thin|auto)/.test(content)) {
      offenders.push(`${rel}: scrollbar-width thin/auto`)
    }
    if (/scrollbar-color:/.test(content)) {
      offenders.push(`${rel}: scrollbar-color`)
    }
    if (/::-webkit-scrollbar(?:-thumb|-track)?/.test(content)) {
      offenders.push(`${rel}: ::-webkit-scrollbar styling`)
    }
  }

  assert(
    'no local custom scrollbar styles outside approved exceptions',
    offenders.length === 0,
    offenders.join('; ')
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
