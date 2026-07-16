#!/usr/bin/env node
/**
 * Verification for shared modal scroll lock.
 *
 * Usage:
 *   npm run verify:modal-scroll-lock
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
  console.log('=== Modal scroll lock verification ===\n')

  const util = read('src/utils/modalScrollLock.js')
  const hook = read('src/hooks/useBodyScrollLock.js')
  const modal = read('src/components/admin/AdminModal.jsx')
  const modalCss = read('src/components/admin/AdminModal.css')

  assert('shared scroll lock utility exists', util.includes('lockModalScroll'))
  assert('scrollY saved before lock', util.includes('scrollY'))
  assert('mobile fixed body strategy', util.includes("body.style.position = 'fixed'"))
  assert('desktop scrollbar compensation', util.includes('paddingRight'))
  assert('scroll restored on unlock', util.includes('window.scrollTo'))
  assert('nested lock counter', util.includes('lockCount'))
  assert('no 100vw in modal css', !modalCss.includes('100vw'))
  assert('modal uses percent width', modalCss.includes('calc(100% - 32px)'))
  assert('shared backdrop token used', modalCss.includes('--platform-modal-backdrop'))
  assert('admin modal uses lock utility', modal.includes('lockModalScroll'))
  assert('admin modal unlocks on cleanup', modal.includes('unlockModalScroll'))
  assert('admin modal onClose stored in ref', modal.includes('onCloseRef'))
  assert('admin modal focus effect isolated', modal.includes('autoFocusClose'))
  assert('body scroll hook delegates to utility', hook.includes('lockModalScroll'))
  assert('filter modal passes return focus ref', read('src/components/procurement/PurchaseFilterPopover.jsx').includes('returnFocusRef={anchorRef}'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
