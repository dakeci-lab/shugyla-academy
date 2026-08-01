#!/usr/bin/env node
/**
 * Verification: schedule day timeline helpers (coverage, bars, midnight end).
 * Usage: npm run verify:schedule-day-timeline
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  buildCoverageSegments,
  buildScheduleDayStats,
  classifyScheduleDayCell,
  getShiftBarLayout,
  getStoreTimelineWindow,
  minutesToTimelineLabel,
  resolveShiftAbsoluteMinutes,
  summarizeDayCoverage,
  timeToMinutes,
} from '../src/utils/scheduleDayTimeline.js'
import { STORE_WORK_HOURS } from '../src/utils/storeWorkHours.js'

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

function nearly(a, b, eps = 0.05) {
  return Math.abs(Number(a) - Number(b)) <= eps
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function main() {
  console.log('=== Schedule day timeline verification ===\n')

  const window = getStoreTimelineWindow()
  assert('store hours start 08:45', STORE_WORK_HOURS.startTime === '08:45')
  assert('store hours end 00:00', STORE_WORK_HOURS.endTime === '00:00')
  assert('08:45 → minutes', timeToMinutes('08:45') === 8 * 60 + 45)
  assert('window start', window.startMin === 8 * 60 + 45)
  assert('window end midnight+1d', window.endMin === 24 * 60)

  const openBar = getShiftBarLayout('08:45', '12:00', window)
  assert('open bar left ~0', nearly(openBar.leftPercent, 0))
  assert('open bar width > 0', openBar.widthPercent > 0)

  const midBar = getShiftBarLayout('12:45', '00:00', window)
  assert('12:45–00:00 end absolute 1440', resolveShiftAbsoluteMinutes('12:45', '00:00').endMin === 1440)
  assert('12:45–00:00 width to end', nearly(midBar.leftPercent + midBar.widthPercent, 100))
  assert('midnight label', minutesToTimelineLabel(1440) === '00:00')

  const overnight = resolveShiftAbsoluteMinutes('22:00', '06:00')
  assert('overnight end > start', overnight.endMin === 6 * 60 + 24 * 60)

  assert('day off classify', classifyScheduleDayCell({ status: 'day_off' }).kind === 'day_off')
  assert('missing classify', classifyScheduleDayCell(null).kind === 'missing')

  const sample = [
    { shift: { status: 'working', plannedStartTime: '08:45', plannedEndTime: '12:00' } },
    { shift: { status: 'working', plannedStartTime: '12:45', plannedEndTime: '00:00' } },
    { shift: { status: 'day_off' } },
    { shift: { status: 'working', plannedStartTime: '11:45', plannedEndTime: '22:00' } },
    { shift: { status: 'working', plannedStartTime: '13:45', plannedEndTime: '00:00' } },
    { shift: { status: 'working', plannedStartTime: '08:45', plannedEndTime: '19:00' } },
    { shift: { status: 'working', plannedStartTime: '12:45', plannedEndTime: '00:00' } },
    { shift: { status: 'working', plannedStartTime: '08:45', plannedEndTime: '19:00' } },
    { shift: { status: 'working', plannedStartTime: '08:45', plannedEndTime: '00:00' } },
    { shift: { status: 'working', plannedStartTime: '15:00', plannedEndTime: '00:00' } },
  ]
  const stats = buildScheduleDayStats(sample, window)
  assert('total with shift = 9', stats.totalWithShift === 9)
  assert('segments non-empty', stats.segments.length > 0)

  const at = (hhmm) => {
    const min = timeToMinutes(hhmm)
    const seg = stats.segments.find((s) => s.startMin <= min && min < s.endMin)
    return seg?.count ?? null
  }
  assert('coverage after 08:45 = 4', at('09:00') === 4)
  assert('coverage after 11:45 = 5', at('11:50') === 5)
  assert('coverage after 12:00 = 4', at('12:15') === 4)
  assert('coverage after 12:45 = 6', at('13:00') === 6)
  assert('coverage after 13:45 = 7', at('14:00') === 7)
  assert('coverage after 15:00 = 8', at('16:00') === 8)
  assert('coverage after 19:00 = 6', at('20:00') === 6)
  assert('coverage after 22:00 = 5', at('23:00') === 5)

  assert('max concurrent = 8', stats.maxConcurrent === 8)
  assert('min during work >= 0', stats.minDuringWork >= 0)
  assert('weakest period set', Boolean(stats.weakestPeriod))

  const empty = buildScheduleDayStats([], window)
  assert('empty total 0', empty.totalWithShift === 0)
  assert('empty max 0', empty.maxConcurrent === 0)
  assert('empty min 0', empty.minDuringWork === 0)
  assert('empty weakest null', empty.weakestPeriod == null)

  const sameStart = buildCoverageSegments(
    [
      { startMin: timeToMinutes('08:45'), endMin: timeToMinutes('12:00') },
      { startMin: timeToMinutes('08:45'), endMin: timeToMinutes('19:00') },
    ],
    window
  )
  assert('same start points merge', sameStart[0].count === 2)

  const sameEnd = summarizeDayCoverage(
    buildCoverageSegments(
      [
        { startMin: timeToMinutes('08:45'), endMin: 24 * 60 },
        { startMin: timeToMinutes('15:00'), endMin: 24 * 60 },
      ],
      window
    )
  )
  assert('same end max >= 1', sameEnd.maxConcurrent >= 1)

  console.log('Structural UI wiring')
  const section = read('src/components/admin/sections/WorkScheduleSection.jsx')
  const timeline = read('src/components/admin/ScheduleDayTimeline.jsx')
  assert(
    'week/day toggle wired',
    section.includes('ScheduleViewModeToggle') && section.includes("viewMode === 'day'")
  )
  assert('day timeline component used', section.includes('ScheduleDayTimeline'))
  assert(
    'URL view+date params',
    section.includes("params.set('view'") && section.includes("params.set('date'")
  )
  assert('no rolePriority hardcode', !section.includes('rolePriority') && !timeline.includes('rolePriority'))
  assert(
    'no positionOrder hardcode',
    !section.includes('positionOrder') && !timeline.includes("['Администратор'")
  )
  assert(
    'organisational order via shared helper',
    section.includes('groupEmployeesByPositionStructure') &&
      section.includes('flattenEmployeeOrganization')
  )
  assert(
    'timeline preserves employees prop order',
    timeline.includes('(employees || []).map') && !/\.sort\s*\(/.test(timeline)
  )
  assert('reuses employee editor navigation', section.includes('openEmployeeSchedule'))

  console.log(`\nSchedule day timeline verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
}

try {
  main()
} catch (err) {
  console.error(`\nFAILED: ${err.message}\n`)
  process.exitCode = 1
}
