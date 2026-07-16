#!/usr/bin/env node
/**
 * Verification for admin notification settings (time tracker rules UI + API).
 *
 * Usage:
 *   npm run verify:notification-settings-admin
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
  console.log('=== Notification settings admin verification ===\n')

  const nav = read('src/platform/platformNav.js')
  const permissions = read('src/config/permissions.js')
  const catalog = read('src/config/permissionCatalog.js')
  const app = read('src/App.jsx')
  const panel = read('src/components/admin/NotificationSettingsPanel.jsx')
  const panelCss = read('src/components/admin/NotificationSettingsPanel.css')
  const pageCss = read('src/pages/platform/PlatformSettingsNotifications.css')
  const service = read('src/services/notificationSettingsAdminService.js')
  const utils = read('src/utils/notificationRuleSettings.js')
  const edgeFn = read('supabase/functions/admin-notification-settings/index.ts')
  const migration = read('supabase/migrations/20260717220000_notification_settings_admin.sql')
  const dispatch = read('supabase/functions/_shared/timeTrackerNotificationDispatch.ts')
  const scheduler = read('supabase/functions/_shared/timeTrackerNotificationScheduler.ts')
  const config = read('supabase/config.toml')

  console.log('Stage 1: Navigation and RBAC')

  assert('settings nav item', nav.includes('Настройки уведомлений'))
  assert('settings route path', nav.includes('/platform/settings/notifications'))
  assert('route key defined', permissions.includes('SETTINGS_NOTIFICATIONS'))
  assert('notifications.manage permission', catalog.includes('notifications.manage'))
  assert('route guarded by notifications.manage', permissions.includes('[P.NOTIFICATIONS_MANAGE]'))
  assert('app route registered', app.includes('settings/notifications'))

  console.log('Stage 2: Admin UI')

  assert('panel save button', panel.includes('Сохранить настройки'))
  assert('panel enabled toggle', panel.includes('Включено'))
  assert('panel offset validation', panel.includes('validateOffsetMinutes'))
  assert('four rule metadata entries', (utils.match(/time_tracker\.rule\./g) || []).length >= 4)
  assert('shift start rule title', utils.includes('Напоминание о начале смены'))
  assert('no test send button', !panel.includes('тестов'))

  console.log('Stage 2b: Mobile PWA layout')

  assert('card intro separated from toggle', panel.includes('notification-settings-card__intro'))
  assert('toggle on dedicated row', panel.includes('notification-settings-card__toggle-row'))
  assert('offset prefix label', panel.includes('notification-settings-card__offset-prefix'))
  assert('offset prefix metadata', utils.includes('offsetPrefix'))
  assert('mobile sticky save bar', panel.includes('notification-settings-panel__actions--mobile'))
  assert('desktop save action preserved', panel.includes('notification-settings-panel__actions--desktop'))
  assert('input font-size 16px', panelCss.includes('font-size: 16px'))
  assert('safe-area inset bottom', panelCss.includes('safe-area-inset-bottom'))
  assert('mobile breakpoint 900px', panelCss.includes('max-width: 900px'))
  assert('overflow wrap on card text', panelCss.includes('overflow-wrap'))
  assert('notifications page mobile width', pageCss.includes('platform-settings--notifications'))
  assert('toggle row uses space-between', panelCss.includes('notification-settings-card__toggle-row'))

  console.log('Stage 3: Edge Function API')

  assert('edge function exists', edgeFn.includes('admin-notification-settings') || edgeFn.includes('get_settings'))
  assert('get_settings action', edgeFn.includes("'get_settings'"))
  assert('update_settings action', edgeFn.includes("'update_settings'"))
  assert('permission notifications.manage', edgeFn.includes("'notifications.manage'"))
  assert('allowlist rule codes', edgeFn.includes('time_tracker.rule.shift_start_soon'))
  assert('offset validation 0-1440', edgeFn.includes('MAX_OFFSET = 1440'))
  assert('forbidden template_id updates', !edgeFn.includes("update({\n        template_id"))
  assert('config.toml registers function', config.includes('admin-notification-settings'))
  assert('frontend invokes edge function', service.includes("'admin-notification-settings'"))

  console.log('Stage 4: Database migration')

  assert('migration adds permission', migration.includes("'notifications.manage'"))
  assert('migration seeds shift_start_soon', migration.includes("'time_tracker.rule.shift_start_soon'"))
  assert('migration on conflict safe', migration.includes('on conflict (code) do nothing'))
  assert('default offset -10 preserved', migration.includes('-10::integer'))

  console.log('Stage 5: Dispatcher reads DB offsets')

  assert('dispatch uses rule.offset_minutes', dispatch.includes('rule.offset_minutes'))
  assert('scheduler loads enabled rules', scheduler.includes('is_enabled'))
  assert('scheduler reads offset_minutes', scheduler.includes('offset_minutes'))
  assert('dispatch has no hardcoded -10', !dispatch.match(/offsetMinutes\s*=\s*-10/))
  assert('dispatch has no hardcoded +5', !dispatch.match(/offsetMinutes\s*=\s*5/))

  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (error) {
  console.error(`\nVerification failed (${testsPassed}/${testsRun} tests): ${error.message}\n`)
  process.exit(1)
}
