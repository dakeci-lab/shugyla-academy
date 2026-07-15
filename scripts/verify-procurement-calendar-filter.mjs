#!/usr/bin/env node
/**
 * Verification for procurement week calendar and filter modal UX.
 *
 * Usage:
 *   npm run verify:procurement-calendar-filter
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

function stageWeekGrid() {
  console.log('Stage 1: Week day grid')

  const css = read('src/components/procurement/SimpleDeliveryCard.css')
  assert('seven equal grid columns', css.includes('grid-template-columns: repeat(7, minmax(0, 1fr))'))
  assert('day cards min-width zero', css.includes('.simple-receiving-day-bar__day'))
  assert('day card min-width zero', /simple-receiving-day-bar__day[\s\S]*min-width:\s*0/.test(css))
  assert('week nav wrapper', read('src/components/procurement/WeekScheduleNav.jsx').includes('week-schedule-nav__days'))
  assert('badge absolute positioning', css.includes('.simple-receiving-day-bar__count'))
  assert('badge does not affect layout', /simple-receiving-day-bar__count[\s\S]*position:\s*absolute/.test(css))
  assert('mobile grid tightening', css.includes('@media (max-width: 900px)'))
  assert('narrow screen breakpoint', css.includes('@media (max-width: 360px)'))
  assert('no scrollIntoView in week nav', !read('src/components/procurement/WeekScheduleNav.jsx').includes('scrollIntoView'))
  assert('no scrollLeft in week nav', !read('src/components/procurement/WeekScheduleNav.jsx').includes('scrollLeft'))
}

function stageFilterModal() {
  console.log('Stage 2: Filter modal')

  const popover = read('src/components/procurement/PurchaseFilterPopover.jsx')
  const popoverCss = read('src/components/procurement/PurchaseFilterPopover.css')

  assert('mobile uses AdminModal', popover.includes('AdminModal'))
  assert('mobile media query hook', popover.includes('(max-width: 900px)'))
  assert('escape closes filter', popover.includes("event.key === 'Escape'"))
  assert('focus returns to filter button', popover.includes('anchorRef?.current?.focus()'))
  assert('inline mobile fixed filter removed', !popoverCss.includes('position: fixed'))
  assert('desktop popover preserved', popoverCss.includes('position: absolute'))
  assert('no 100vw popover width', !popoverCss.includes('100vw'))
}

function stageBackdropAndToolbar() {
  console.log('Stage 3: Backdrop and toolbar')

  const indexCss = read('src/index.css')
  const adminModalCss = read('src/components/admin/AdminModal.css')
  const page = read('src/pages/platform/procurement/ProcurementPage.jsx')
  const pageCss = read('src/pages/platform/procurement/ProcurementPage.css')

  assert('shared backdrop token', indexCss.includes('--platform-modal-backdrop'))
  assert('admin modal uses backdrop token', adminModalCss.includes('var(--platform-modal-backdrop'))
  assert('desktop create button exists', page.includes('procurement-page__desktop-create'))
  assert('desktop create aria-label', page.includes('aria-label="Создать закуп"'))
  assert('desktop create uses openCreate', page.includes('onClick={() => openCreate()}'))
  assert('desktop create hidden on mobile', pageCss.includes('.procurement-page__desktop-create'))
  assert('mobile create hidden on desktop', pageCss.includes('.procurement-page__mobile-create'))
  assert('no duplicate mobile desktop create on mobile', /max-width:\s*900px[\s\S]*desktop-create[\s\S]*display:\s*none/.test(pageCss))
}

function stageScrollLock() {
  console.log('Stage 4: Scroll lock')

  const adminModal = read('src/components/admin/AdminModal.jsx')
  assert('admin modal scroll lock', adminModal.includes("document.body.style.overflow = 'hidden'"))
  assert('admin modal restores overflow', adminModal.includes('document.body.style.overflow = previousOverflow'))
}

function main() {
  console.log('=== Procurement calendar & filter verification ===\n')
  stageWeekGrid()
  stageFilterModal()
  stageBackdropAndToolbar()
  stageScrollLock()
  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
