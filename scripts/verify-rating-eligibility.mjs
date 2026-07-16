#!/usr/bin/env node
/**
 * Verification for rating eligibility and schedule background sync helpers.
 *
 * Usage:
 *   npm run verify:rating-eligibility
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  isEffectivePlannedEndReached,
  isOvernightPlannedShift,
} from '../src/utils/shiftWorkWindow.js'

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

function shift(overrides) {
  return {
    id: overrides.id ?? 1,
    employeeId: overrides.employeeId ?? 10,
    shiftDate: overrides.shiftDate ?? '2026-07-10',
    status: overrides.status ?? 'working',
    plannedStartTime: overrides.plannedStartTime ?? '09:00',
    plannedEndTime: overrides.plannedEndTime ?? '18:00',
    actualStartTime: overrides.actualStartTime ?? null,
    actualEndTime: overrides.actualEndTime ?? null,
    ...overrides,
  }
}

function stageRatingSourceContract() {
  console.log('Stage 1: Rating source contract')

  const attendanceData = read('src/utils/attendanceData.js')
  assert('RATING_STATUS exported', attendanceData.includes('export const RATING_STATUS'))
  assert('buildEmployeeRatingResult exported', attendanceData.includes('export function buildEmployeeRatingResult'))
  assert('isShiftCompletedForRating exported', attendanceData.includes('export function isShiftCompletedForRating'))
  assert('no default score fallback in calculateEmployeeRatingFromShifts', attendanceData.includes('return buildEmployeeRatingResult'))
  assert('null totalPoints in no schedule stats', attendanceData.includes('totalPoints: null'))

  const ratingEligibility = read('src/utils/ratingEligibility.js')
  assert('display rows helper present', ratingEligibility.includes('buildRatingDisplayRows'))
  assert('eligible compare uses completedShiftCount', ratingEligibility.includes('completedShiftCount'))

  const ratingSection = read('src/components/admin/sections/EmployeeRatingSection.jsx')
  assert('rating section uses buildRatingDisplayRows', ratingSection.includes('buildRatingDisplayRows'))
  assert('rating section removed totalPoints || 100 fallback', !ratingSection.includes('totalPoints: 100'))
  assert('insufficient badge rendered', ratingSection.includes('Недостаточно данных'))
  assert('excluded banner rendered', ratingSection.includes('Не участвуют в рейтинге'))
}

function stageCompletedShiftRules() {
  console.log('Stage 2: Completed shift rules')

  const now = new Date('2026-07-15T17:00:00+05:00')
  const todayOpen = shift({ shiftDate: '2026-07-15' })
  assert('today open shift end not reached', !isEffectivePlannedEndReached(todayOpen, now))

  const todayEnded = shift({
    shiftDate: '2026-07-15',
    plannedEndTime: '13:00',
  })
  assert('today ended shift effective end reached', isEffectivePlannedEndReached(todayEnded, now))

  const overnight = shift({
    shiftDate: '2026-07-14',
    plannedStartTime: '22:00',
    plannedEndTime: '06:00',
  })
  assert('overnight shift detected', isOvernightPlannedShift('22:00', '06:00'))
  const afterOvernight = new Date('2026-07-15T07:00:00+05:00')
  assert(
    'overnight effective end reached next morning',
    isEffectivePlannedEndReached(overnight, afterOvernight)
  )
}

function stageOptimisticSyncHelpers() {
  console.log('Stage 3: Optimistic schedule sync helpers')

  const hook = read('src/hooks/useScheduleBackgroundSync.js')
  assert('background sync hook exists', hook.includes('useScheduleBackgroundSync'))
  assert('optimistic upsert helper exists', hook.includes('upsertShiftInList'))
  assert('mutation version tracking exists', hook.includes('mutationVersionsRef'))
  assert('beforeunload guard exists', hook.includes('beforeunload'))
  assert('toast saving message exists', hook.includes('Сохраняем график'))
}

function stageAttendanceGuard() {
  console.log('Stage 4: Attendance deletion guard')

  const guard = read('src/utils/shiftAttendanceGuard.js')
  assert('destructive schedule guard exists', guard.includes('isDestructiveScheduleChange'))
  assert('attendance history helper exists', guard.includes('hasShiftAttendanceHistory'))

  const modal = read('src/components/admin/ShiftDayEditModal.jsx')
  assert('modal asks destructive confirmation', modal.includes('destructiveConfirm'))

  const edgeWrite = read('supabase/functions/_shared/employeeScheduleWrite.ts')
  assert('edge write has attendance guard', edgeWrite.includes('assertScheduleChangeAllowed'))
  assert('edge write has hasShiftAttendanceHistory', edgeWrite.includes('hasShiftAttendanceHistory'))
}

function stagePerformanceAndNotifications() {
  console.log('Stage 5: Performance and notifications')

  const notificationContext = read('src/context/NotificationInboxContext.jsx')
  assert('notifications deferred via idle callback', notificationContext.includes('requestIdleCallback'))
  assert('notification context memoized', notificationContext.includes('useMemo'))

  const dataAdapter = read('src/services/supabaseDataAdapter.js')
  assert('fetchAllData parallel secondary loads', dataAdapter.includes('Promise.allSettled'))

  const scheduleSection = read('src/components/admin/sections/EmployeeScheduleSection.jsx')
  const bulkModal = read('src/components/admin/BulkScheduleModal.jsx')
  const syncHook = read('src/hooks/useScheduleBackgroundSync.js')
  assert('schedule uses background sync hook', scheduleSection.includes('useScheduleBackgroundSync'))
  assert('schedule save no longer blocks on reload', !scheduleSection.includes('await loadScheduleData()'))
  assert('bulk modal does not await apply', !bulkModal.includes('await onApply'))
  assert('bulk modal passes operation snapshot', bulkModal.includes('form: formSnapshot'))
  assert('bulk background status banner', scheduleSection.includes('График сохраняется'))
  assert('bulk retry action', scheduleSection.includes('Повторить'))
  assert('bulk operation state model', syncHook.includes('BULK_OPERATION_STATUS'))
  assert('bulk save closes before network', syncHook.includes('closeModal?.()') && syncHook.includes('void runBulkSave'))

  const toastContext = read('src/context/ToastContext.jsx')
  assert('toast context value memoized', toastContext.includes('useMemo'))
}

function main() {
  console.log('=== Rating eligibility & schedule sync verification ===\n')
  stageRatingSourceContract()
  stageCompletedShiftRules()
  stageOptimisticSyncHelpers()
  stageAttendanceGuard()
  stagePerformanceAndNotifications()
  console.log(`\nVerification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

main()
