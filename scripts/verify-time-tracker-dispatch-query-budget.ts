// Query-budget regression check for the per-minute time-tracker scheduler.
// The scheduler runs every minute, so per-shift/per-rule queries against
// `notifications` were the dominant source of API traffic. Run:
//   npm run verify:time-tracker-dispatch-query-budget
import { dispatchTimeTrackerNotifications } from '../supabase/functions/_shared/timeTrackerNotificationDispatch.ts'

function fake(tables: Record<string, any[]>) {
  const counts: Record<string, number> = {}
  const client = {
    from(t: string) {
      counts[t] = (counts[t] ?? 0) + 1
      let rows = [...(tables[t] ?? [])]
      const q: any = {
        select() { return q }, eq(c: string, v: any) { rows = rows.filter(r => r[c] === v); return q },
        in(c: string, v: any[]) { rows = rows.filter(r => v.includes(r[c])); return q },
        like(c: string, p: string) { const pre = p.replace(/%$/, ''); rows = rows.filter(r => String(r[c]).startsWith(pre)); return q },
        gte(c: string, v: any) { rows = rows.filter(r => r[c] >= v); return q },
        lte(c: string, v: any) { rows = rows.filter(r => r[c] <= v); return q },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res) },
      }
      return q
    },
  }
  return { client: client as any, counts }
}

const rules = [
  { id: 'r1', code: 'a', template_id: 't1', module_code: 'time_tracker', event_code: 'shift_start_soon', offset_minutes: -15, repeat_after_minutes: null, max_attempts: 1, priority: 'normal', channels: [] },
  { id: 'r2', code: 'b', template_id: 't2', module_code: 'time_tracker', event_code: 'clock_in_missing', offset_minutes: 5, repeat_after_minutes: 10, max_attempts: 3, priority: 'high', channels: [] },
  { id: 'r3', code: 'c', template_id: 't3', module_code: 'time_tracker', event_code: 'shift_end_reached', offset_minutes: 0, repeat_after_minutes: null, max_attempts: 1, priority: 'normal', channels: [] },
  { id: 'r4', code: 'd', template_id: 't4', module_code: 'time_tracker', event_code: 'clock_out_missing', offset_minutes: 10, repeat_after_minutes: 15, max_attempts: 2, priority: 'high', channels: [] },
]
const tpl = ['t1','t2','t3','t4'].map(id => ({ id, code: id, title_template: 'x', body_template: 'y', default_action_url: null, default_priority: 'normal' }))
const users = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, status: 'active', auth_user_id: null }))
const day = '2026-10-04'
const mk = (i: number, extra: any = {}) => ({ id: `s${i}`, employee_id: i, shift_date: day, status: 'working', planned_start_time: '09:00:00', planned_end_time: '18:00:00', actual_start_time: null, actual_end_time: null, ...extra })
const shifts = [
  mk(1), mk(2, { actual_start_time: '09:01:00' }), mk(3, { actual_start_time: '09:00:00', actual_end_time: '18:00:00' }),
  mk(4, { planned_start_time: '14:00:00', planned_end_time: '23:00:00' }), mk(5, { status: 'off' }),
  mk(6), mk(7, { planned_start_time: '09:00:00', planned_end_time: '00:00:00', actual_start_time: '09:05:00' }),
]
const key = (ev: string, e: number, s: string, a?: number) => `time_tracker:${ev}:${e}:${s}` + (a ? `:a${a}` : '')
const notifs0 = [
  { deduplication_key: key('clock_in_missing', 1, 's1', 1), created_at: '2026-10-04T04:10:00Z' },
  { deduplication_key: key('clock_in_missing', 6, 's6', 1), created_at: '2026-10-04T04:10:00Z' },
  { deduplication_key: key('clock_in_missing', 6, 's6', 2), created_at: '2026-10-04T04:30:00Z' },
  { deduplication_key: key('clock_in_missing', 6, 's6', 3), created_at: '2026-10-04T04:50:00Z' },
  { deduplication_key: key('shift_end_reached', 2, 's2'), created_at: '2026-10-04T13:00:00Z' },
]
const notifs = notifs0.map(n => ({ ...n, employee_id: Number(n.deduplication_key.split(':')[2]) }))

// [run at, expected matchedEvents, max queries to `notifications`]
const cases: Array<[string, number, number]> = [
  ['2026-10-03T22:00:00Z', 0, 0], // idle: nothing due -> no notifications queries
  ['2026-10-04T03:50:00Z', 2, 1],
  ['2026-10-04T04:06:00Z', 0, 1],
  ['2026-10-04T04:25:00Z', 1, 1],
  ['2026-10-04T05:05:00Z', 1, 1],
  ['2026-10-04T13:05:00Z', 3, 1],
  ['2026-10-04T13:30:00Z', 4, 1],
  ['2026-10-04T19:30:00Z', 6, 1],
]
let failed = 0
for (const [at, expectedMatched, maxQueries] of cases) {
  const f = fake({ academy_employee_shifts: shifts, academy_users: users, notification_templates: tpl, notifications: notifs })
  const r = await dispatchTimeTrackerNotifications({ serviceClient: f.client, runAt: new Date(at), rules: rules as any, dryRun: true })
  const queries = f.counts.notifications ?? 0
  const ok = r.matchedEvents === expectedMatched && queries <= maxQueries
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${at} matched=${r.matchedEvents} (want ${expectedMatched}) notificationQueries=${queries} (max ${maxQueries})`)
}
if (failed) {
  console.error(`${failed} check(s) failed`)
  Deno.exit(1)
}
console.log('time-tracker dispatch query budget: OK')
