#!/usr/bin/env node
/**
 * Verification for mobile header and sidebar shell UX.
 *
 * Usage:
 *   npm run verify:mobile-shell
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
  console.log('=== Mobile shell verification ===\n')

  const mobileHeader = read('src/components/platform/PlatformMobileHeader.jsx')
  const headerActions = read('src/components/platform/PlatformHeaderActions.jsx')
  const layout = read('src/layouts/PlatformLayout.jsx')
  const sidebar = read('src/components/platform/PlatformSidebar.jsx')
  const sidebarCss = read('src/components/platform/PlatformSidebar.css')
  const mobileProfile = read('src/components/platform/PlatformSidebarMobileProfile.jsx')
  const userMenu = read('src/components/platform/PlatformUserMenu.jsx')

  console.log('Stage 1: Mobile header')

  assert('mobile header hides user menu', mobileHeader.includes('showUserMenu={false}'))
  assert('mobile header keeps notification bell', mobileHeader.includes('PlatformHeaderActions'))
  assert('mobile header no user prop', !mobileHeader.includes('user={user}'))
  assert('mobile header no compact avatar mode', !mobileHeader.includes('compact'))
  assert('header actions support showUserMenu flag', headerActions.includes('showUserMenu'))
  assert('header actions render bell', headerActions.includes('NotificationBell'))
  assert('user menu gated by showUserMenu', headerActions.includes('showUserMenu &&'))

  console.log('Stage 2: Desktop header preserved')

  assert('desktop topbar keeps user menu', layout.includes('<PlatformHeaderActions user={user}'))
  assert('desktop topbar no showUserMenu false', !layout.match(/platform-layout__topbar[\s\S]*showUserMenu=\{false\}/))
  assert('desktop dropdown preserved', userMenu.includes('platform-user-menu__dropdown'))

  console.log('Stage 3: Mobile drawer header')

  assert('sidebar close button removed', !sidebar.includes('platform-sidebar__close'))
  assert('close styles removed', !sidebarCss.includes('platform-sidebar__close'))
  assert('mobile profile block preserved', sidebar.includes('PlatformSidebarMobileProfile'))
  assert('profile navigates to profile route', mobileProfile.includes('/platform/profile'))
  assert('profile edit icon preserved', mobileProfile.includes('platform-sidebar__profile-edit'))
  assert('compact mobile header padding', sidebarCss.includes('padding: 14px 16px'))

  console.log('Stage 4: Drawer close behavior')

  assert('backdrop overlay closes drawer', layout.includes('platform-layout__overlay'))
  assert('backdrop click closes drawer', layout.includes('onClick={closeDrawer}'))
  assert('nav click closes drawer', layout.includes('onNavigate={closeDrawer}'))
  assert('route change closes drawer', layout.includes('setDrawerOpen(false)'))
  assert('escape closes drawer', layout.includes("event.key === 'Escape'"))

  console.log('Stage 5: Scroll and layout')

  assert('nav keeps overflow-y auto', sidebarCss.includes('overflow-y: auto'))
  const indexCss = read('src/index.css')
  assert('global scrollbar hidden via scrollbar-width', indexCss.includes('scrollbar-width: none'))
  assert('global scrollbar hidden via webkit', indexCss.includes('*::-webkit-scrollbar'))
  assert('drawer width not full screen', sidebarCss.includes('min(360px, 86vw)'))
  assert('desktop sidebar sticky preserved', sidebarCss.match(/min-width: 901px[\s\S]*position: sticky/))

  const layoutCss = read('src/layouts/PlatformLayout.css')
  assert(
    'desktop shell locks layout height',
    layoutCss.includes('height: 100dvh') && layoutCss.includes('.platform-layout__refresh'),
  )
  assert(
    'desktop content area scrolls',
    /@media \(min-width: 901px\)[\s\S]*\.platform-layout__refresh[\s\S]*overflow-y:\s*auto/.test(layoutCss),
  )
  assert(
    'desktop topbar stays above content',
    /@media \(min-width: 901px\)[\s\S]*\.platform-layout__topbar[\s\S]*position:\s*sticky/.test(layoutCss),
  )

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
