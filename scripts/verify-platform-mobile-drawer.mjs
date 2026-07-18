#!/usr/bin/env node
/**
 * Verification: platform mobile drawer covers viewport and locks scroll.
 *
 * Usage:
 *   npm run verify:platform-mobile-drawer
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
  console.log('=== Platform mobile drawer verification ===\n')

  const layout = read('src/layouts/PlatformLayout.jsx')
  const layoutCss = read('src/layouts/PlatformLayout.css')
  const sidebarCss = read('src/components/platform/PlatformSidebar.css')
  const scrollLock = read('src/utils/modalScrollLock.js')
  const edgeSwipe = read('src/hooks/useMobileDrawerEdgeSwipe.js')

  console.log('Stage 1: Scroll lock')
  assert('uses lockModalScroll', layout.includes('lockModalScroll'))
  assert('uses unlockModalScroll', layout.includes('unlockModalScroll'))
  assert('does not set body.overflow directly', !layout.includes("document.body.style.overflow"))
  assert('closes drawer on route change', layout.includes('setDrawerOpen(false)') && layout.includes('[pathname]'))
  assert('lockModalScroll fixes body on mobile', scrollLock.includes("body.style.position = 'fixed'"))

  console.log('\nStage 2: Overlay covers viewport')
  assert('overlay position fixed', layoutCss.includes('.platform-layout__overlay') && layoutCss.includes('position: fixed'))
  assert('overlay uses 100dvh', layoutCss.includes('100dvh'))
  assert('overlay z-index above schedule sheets', /z-index:\s*4000/.test(layoutCss))

  console.log('\nStage 3: Drawer panel')
  assert('sidebar fixed on mobile', sidebarCss.includes('position: fixed'))
  assert('sidebar uses 100dvh', sidebarCss.includes('100dvh'))
  assert('sidebar safe-area top', sidebarCss.includes('safe-area-inset-top'))
  assert('sidebar safe-area bottom', sidebarCss.includes('safe-area-inset-bottom'))
  assert('sidebar z-index above overlay', /z-index:\s*4010/.test(sidebarCss))
  assert('nav scrolls internally', sidebarCss.includes('.platform-sidebar__nav') && sidebarCss.includes('overflow-y: auto'))
  assert('overscroll contain', sidebarCss.includes('overscroll-behavior: contain'))

  console.log('\nStage 4: Edge swipe gesture')
  assert('edge swipe hook wired', layout.includes('useMobileDrawerEdgeSwipe'))
  assert('edge zone constant', edgeSwipe.includes('EDGE_ZONE_PX'))
  assert('follow-finger drag', edgeSwipe.includes('applyDragVisual') || edgeSwipe.includes('translateX'))
  assert('axis lock ignores vertical', edgeSwipe.includes('AXIS_LOCK') || edgeSwipe.includes('ignore'))
  assert('edge capture strip', layout.includes('platform-layout__edge-swipe'))
  assert('desktop overlay forced off', layoutCss.includes('min-width: 901px') && layoutCss.includes('display: none !important'))
  assert('pull-to-refresh disabled while dragging', layout.includes('drawerDragging'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
