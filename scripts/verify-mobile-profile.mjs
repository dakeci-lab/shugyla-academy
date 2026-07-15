#!/usr/bin/env node
/**
 * Verification for mobile profile and sidebar UX.
 *
 * Usage:
 *   npm run verify:mobile-profile
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
  console.log('=== Mobile profile verification ===\n')

  const sidebar = read('src/components/platform/PlatformSidebar.jsx')
  const sidebarCss = read('src/components/platform/PlatformSidebar.css')
  const userMenu = read('src/components/platform/PlatformUserMenu.jsx')
  const profile = read('src/pages/Profile.jsx')
  const profileCss = read('src/pages/Profile.css')
  const migration = read('supabase/migrations/20260715200000_academy_users_self_profile_update.sql')

  assert('mobile sidebar profile component', sidebar.includes('PlatformSidebarMobileProfile'))
  assert('desktop brand preserved', sidebar.includes('Shugyla Platform'))
  assert('mobile brand hidden via conditional', sidebar.includes('isMobile ?'))
  assert('sidebar profile uses employee avatar', read('src/components/platform/PlatformSidebarMobileProfile.jsx').includes('EmployeeAvatar'))
  assert('sidebar profile navigates to profile', read('src/components/platform/PlatformSidebarMobileProfile.jsx').includes('/platform/profile'))
  assert('mobile drawer width adjusted', sidebarCss.includes('min(360px, 86vw)'))
  assert('mobile avatar opens profile directly', userMenu.includes("if (compact)"))
  assert('mobile dropdown hidden', userMenu.includes('!compact && open'))
  assert('desktop dropdown preserved', userMenu.includes('platform-user-menu__dropdown'))
  assert('profile centered avatar', profile.includes('layout="centered"'))
  assert('profile first and last name fields', profile.includes('firstName') && profile.includes('lastName'))
  assert('profile email field', profile.includes('contactEmail'))
  assert('profile read-only role and phone', profile.includes('profile-page__role') && profile.includes('profile-page__phone'))
  assert('profile save button', profile.includes('profile-page__save'))
  assert('password modal', profile.includes('ProfilePasswordModal'))
  assert('notifications modal', profile.includes('ProfileNotificationsModal'))
  assert('logout on profile page', profile.includes('profile-page__logout'))
  assert('toast on profile save', profile.includes('showSuccess'))
  assert('compact notifications modal', read('src/components/profile/ProfileNotificationsModal.jsx').includes('Уведомления на этом устройстве'))
  assert('no long push descriptions in profile page', !profile.includes('PushNotificationSettings'))
  assert('contact email migration', migration.includes('contact_email'))
  assert('self profile update policy', migration.includes('academy_users_update_own_profile'))
  assert('updateProfile service', read('src/services/academyDataService.js').includes('export async function updateProfile'))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
