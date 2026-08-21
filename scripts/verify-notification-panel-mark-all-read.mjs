#!/usr/bin/env node
/**
 * Web NotificationPanel: mark-all-read control reuses inbox context.
 *
 * Usage:
 *   npm run verify:notification-panel-mark-all-read
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(label, condition) {
  checks += 1
  if (!condition) throw new Error(`FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const panel = read('src/components/platform/notifications/NotificationPanel.jsx')
const context = read('src/context/NotificationInboxContext.jsx')
const service = read('src/services/inAppNotificationService.js')
const mobileInbox = read('src/pages/platform/PlatformNotificationsInbox.jsx')

assert(
  'panel imports CheckCheckIcon',
  panel.includes('CheckCheckIcon') && panel.includes("from '../../icons/PlatformIcons'")
)
assert(
  'panel wires markAllAsRead from inbox context',
  panel.includes('markAllAsRead') &&
    panel.includes('useNotificationInbox()') &&
    /onMarkAllRead|handleMarkAllRead/.test(panel)
)
assert(
  'panel mark-all control has accessible name',
  panel.includes('aria-label="Прочитать все"') && panel.includes('title="Прочитать все"')
)
assert(
  'mark-all disabled when no unread or in flight',
  panel.includes('markingAll || unreadCount <= 0') ||
    panel.includes('unreadCount <= 0')
)
assert(
  'context still exports markAllAsRead',
  context.includes('markAllAsRead') && context.includes('markAllNotificationsRead')
)
assert(
  'service still uses mark_all_notifications_read RPC',
  service.includes('export async function markAllNotificationsRead') &&
    service.includes("rpc('mark_all_notifications_read')")
)
assert(
  'mobile full-page inbox mark-all left intact',
  mobileInbox.includes('CheckCheckIcon') &&
    mobileInbox.includes('aria-label="Прочитать все"') &&
    mobileInbox.includes('markAllAsRead')
)
assert(
  'panel does not invent a second mark-all service call',
  !panel.includes('markAllNotificationsRead(') &&
    !panel.includes("rpc('mark_all_notifications_read')")
)

console.log(`\n${checks}/${checks} checks passed`)
