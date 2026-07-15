#!/usr/bin/env node
/**
 * Verification for centralized mobile page titles in platform header.
 *
 * Usage:
 *   npm run verify:mobile-page-header
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

function stagePlatformSectionTitles() {
  console.log('Stage 1: Route section titles')

  const nav = read('src/platform/platformNav.js')
  assert('receiving title in nav', nav.includes("title: 'Приёмка'"))
  assert('employees list title in nav', nav.includes("title: 'Список сотрудников'"))
  assert('dynamic employee schedule helper', nav.includes('getDynamicPlatformSection'))
  assert('supplier detail title', nav.includes("title: 'Поставщик'"))
  assert('profile section', nav.includes("title: 'Профиль'"))
}

function stageLayoutAndHeader() {
  console.log('Stage 2: Layout and mobile header')

  const layout = read('src/layouts/PlatformLayout.jsx')
  assert('layout passes title to mobile header', layout.includes('title={pageTitle}'))
  assert('layout uses getPlatformSection', layout.includes('getPlatformSection(pathname)'))
  assert('page title provider exists', layout.includes('PlatformPageTitleProvider'))
  assert('mobile duplicate head removed', !layout.includes('platform-layout__mobile-head'))

  const layoutCss = read('src/layouts/PlatformLayout.css')
  assert('mobile-head css removed', !layoutCss.includes('platform-layout__mobile-head'))
  assert('desktop topbar preserved', layoutCss.includes('.platform-layout__topbar'))

  const header = read('src/components/platform/PlatformMobileHeader.jsx')
  assert('mobile header uses page title', header.includes('platform-mobile-header__title'))
  assert('brand block removed', !header.includes('platform-mobile-header__brand'))
  assert('logo removed', !header.includes('platform-mobile-header__logo'))

  const headerCss = read('src/components/platform/PlatformMobileHeader.css')
  assert('grid layout for centering', headerCss.includes('grid-template-columns'))
  assert('safe area inset', headerCss.includes('safe-area-inset-top'))
  assert('ellipsis on title', headerCss.includes('text-overflow: ellipsis'))
  assert('mobile breakpoint 900px', headerCss.includes('max-width: 900px'))
}

function stageFuturePages() {
  console.log('Stage 3: Future page title hook')

  const context = read('src/context/PlatformPageTitleContext.jsx')
  assert('usePlatformPageTitle exported', context.includes('export function usePlatformPageTitle'))
  assert('override in layout shell', read('src/layouts/PlatformLayout.jsx').includes('titleContext?.override'))
}

function main() {
  console.log('=== Mobile page header verification ===\n')
  stagePlatformSectionTitles()
  stageLayoutAndHeader()
  stageFuturePages()
  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

main()
