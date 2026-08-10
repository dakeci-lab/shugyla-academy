#!/usr/bin/env node
/**
 * Verify UMAG sync UX + settlements period math + chunked child fetches + error normalization.
 *
 * Usage:
 *   npm run verify:umag-sync-settlements-ux
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

async function stageChunking() {
  console.log('Stage 1: ID chunking + per-chunk range pagination')
  const {
    chunkArray,
    DEFAULT_IN_FILTER_CHUNK_SIZE,
    DEFAULT_POSTGREST_PAGE_SIZE,
    MAX_POSTGREST_PAGES_PER_CHUNK,
    fetchAllRowsByIdChunks,
  } = await import(pathToFileURL(path.join(ROOT, 'src/utils/chunkArray.js')).href)

  assert('default chunk size is 100', DEFAULT_IN_FILTER_CHUNK_SIZE === 100)
  assert('default page size is 1000', DEFAULT_POSTGREST_PAGE_SIZE === 1000)
  assert('max pages cap exists', MAX_POSTGREST_PAGES_PER_CHUNK >= 2)
  assert('empty → no chunks', chunkArray([]).length === 0)
  assert('exact multiple', chunkArray(Array.from({ length: 200 }, (_, i) => i)).length === 2)
  const big = Array.from({ length: 250 }, (_, i) => `id-${i}`)
  const chunks = chunkArray(big, 100)
  assert('250 ids → 3 chunks', chunks.length === 3)
  assert('chunk sizes 100/100/50', chunks[0].length === 100 && chunks[1].length === 100 && chunks[2].length === 50)
  assert('no id loss', chunks.flat().length === 250 && chunks.flat()[249] === 'id-249')
  assert('order preserved', chunks.flat().every((id, i) => id === `id-${i}`))

  const calls = []
  const rows = await fetchAllRowsByIdChunks({
    ids: Array.from({ length: 120 }, (_, i) => `p-${i}`),
    idChunkSize: 100,
    pageSize: 50,
    maxPagesPerChunk: 5,
    fetchPage: async ({ idChunk, from, to }) => {
      calls.push({ size: idChunk.length, from, to })
      const count = from >= 100 ? 0 : Math.min(50, 100 - from)
      return {
        data: Array.from({ length: count }, (_, i) => ({ id: `${idChunk[0]}-${from + i}` })),
        error: null,
      }
    },
    onPageResult: (result) => result.data || [],
  })
  assert('range loop issues multiple pages', calls.some((c) => c.from === 50))
  assert('range uses stable page window', calls.every((c) => c.to - c.from + 1 === 50))
  assert('paginated rows collected', rows.length === 200)

  let overflowThrown = false
  try {
    await fetchAllRowsByIdChunks({
      ids: ['x'],
      idChunkSize: 100,
      pageSize: 10,
      maxPagesPerChunk: 2,
      fetchPage: async () => ({ data: Array.from({ length: 10 }, (_, i) => ({ i })), error: null }),
      onPageResult: (result) => result.data,
      overflowMessage: 'OVERFLOW',
    })
  } catch (err) {
    overflowThrown = err.message === 'OVERFLOW'
  }
  assert('full pages hit maxPages → throw (no infinite loop)', overflowThrown)

  const purchase = read('src/services/purchaseSupabaseAdapter.js')
  const receiving = read('src/services/receivingSupabaseAdapter.js')
  assert('purchases uses fetchAllRowsByIdChunks', purchase.includes('fetchAllRowsByIdChunks'))
  assert('receiving uses fetchAllRowsByIdChunks', receiving.includes('fetchAllRowsByIdChunks'))
  assert('purchases orders by created_at + id', /order\('created_at'[\s\S]*order\('id'/.test(purchase))
  assert('receiving orders by created_at + id', /order\('created_at'[\s\S]*order\('id'/.test(receiving))
  assert('purchases uses .range(from, to)', purchase.includes('.range(from, to)'))
  assert('receiving uses .range(from, to)', receiving.includes('.range(from, to)'))
}

async function stageErrorNormalization() {
  console.log('Stage 2: User / Edge error normalization')
  const userErr = await import(pathToFileURL(path.join(ROOT, 'src/utils/userErrorMessage.js')).href)
  const edge = await import(pathToFileURL(path.join(ROOT, 'src/utils/edgeFunctionErrors.js')).href)

  const fallback = 'Не удалось загрузить данные с сервера.'
  assert(
    'Bad Request → fallback',
    userErr.toUserErrorMessage(new Error('Bad Request'), fallback) === fallback
  )
  assert(
    'non-2xx → fallback',
    userErr.toUserErrorMessage(
      new Error('Edge Function returned a non-2xx status code'),
      fallback
    ) === fallback
  )
  assert(
    'Unauthorized → fallback',
    userErr.toUserErrorMessage(new Error('Unauthorized'), fallback) === fallback
  )
  assert(
    'Forbidden → fallback',
    userErr.toUserErrorMessage(new Error('Forbidden'), fallback) === fallback
  )
  assert(
    'Not Found → fallback',
    userErr.toUserErrorMessage(new Error('Not Found'), fallback) === fallback
  )
  assert(
    'Internal Server Error → fallback',
    userErr.toUserErrorMessage(new Error('Internal Server Error'), fallback) === fallback
  )
  assert(
    'FunctionsHttpError name → fallback',
    userErr.toUserErrorMessage(
      Object.assign(new Error('Request failed'), { name: 'FunctionsHttpError' }),
      fallback
    ) === fallback
  )
  assert(
    'FunctionsRelayError → fallback',
    edge.isTechnicalEdgeErrorName('FunctionsRelayError')
  )
  assert(
    'FunctionsFetchError → fallback',
    edge.isTechnicalEdgeErrorName('FunctionsFetchError')
  )
  assert(
    'Russian business message preserved',
    userErr.toUserErrorMessage(
      new Error('Недостаточно прав для синхронизации с UMAG.'),
      fallback
    ) === 'Недостаточно прав для синхронизации с UMAG.'
  )
  assert(
    'resolveEdge keeps structured Russian',
    edge.resolveEdgeFunctionUserMessage({
      error: new Error('Bad Request'),
      body: { success: false, message: 'Укажите корректный период синхронизации.' },
      fallback,
    }) === 'Укажите корректный период синхронизации.'
  )
  assert(
    'resolveEdge Bad Request without body → fallback',
    edge.resolveEdgeFunctionUserMessage({
      error: Object.assign(new Error('Bad Request'), { name: 'FunctionsHttpError' }),
      body: null,
      fallback,
    }) === fallback
  )
  assert(
    'isGenericInvokeErrorMessage covers Bad Request',
    edge.isGenericInvokeErrorMessage('Bad Request')
  )
  assert(
    'isGenericInvokeErrorMessage covers FunctionsHttpError label',
    edge.isGenericInvokeErrorMessage('FunctionsHttpError')
  )
  assert(
    'Supabase не настроен → Сервер не настроен',
    userErr.toUserErrorMessage(new Error('Supabase не настроен'), fallback) === 'Сервер не настроен'
  )

  const planningSrc = read('src/services/procurementPlanningService.js')
  const planningFallback = 'Не удалось выполнить операцию планирования. Повторите попытку.'
  assert(
    'planning service uses resolveEdgeFunctionUserMessage',
    planningSrc.includes('resolveEdgeFunctionUserMessage')
  )
  assert(
    'planning mapInvokeFailure no raw error.message passthrough',
    !planningSrc.includes('isGenericInvokeErrorMessage(error.message)') &&
      !/:\s*error\.message\)/.test(planningSrc)
  )
  assert(
    'procurement Bad Request → Russian operation fallback',
    edge.resolveEdgeFunctionUserMessage({
      error: new Error('Bad Request'),
      body: null,
      fallback: planningFallback,
    }) === planningFallback
  )
  assert(
    'procurement structured Russian body preserved',
    edge.resolveEdgeFunctionUserMessage({
      error: new Error('Bad Request'),
      body: {
        success: false,
        code: 'SYNC_FAILED',
        message: 'Не удалось синхронизировать остатки и продажи.',
      },
      fallback: planningFallback,
    }) === 'Не удалось синхронизировать остатки и продажи.'
  )
}

async function stagePeriodMath() {
  console.log('Stage 3: Settlements period presets / shift')
  const period = await import(
    pathToFileURL(path.join(ROOT, 'src/utils/settlementsPeriod.js')).href
  )

  // 10 Aug 2026 12:00 Aqtobe (UTC+5)
  const ref = new Date('2026-08-10T12:00:00+05:00')
  assert('date key 2026-08-10', period.toSettlementsDateKey(ref) === '2026-08-10')

  const yesterday = period.getSettlementsPeriodDates(period.SETTLEMENTS_PERIOD_PRESET.YESTERDAY, ref)
  assert('yesterday 09.08', yesterday.dateFrom === '2026-08-09' && yesterday.dateTo === '2026-08-09')

  const today = period.getSettlementsPeriodDates(period.SETTLEMENTS_PERIOD_PRESET.TODAY, ref)
  assert('today 10.08', today.dateFrom === '2026-08-10' && today.dateTo === '2026-08-10')

  const week = period.getSettlementsPeriodDates(period.SETTLEMENTS_PERIOD_PRESET.WEEK, ref)
  assert('week 10–16.08', week.dateFrom === '2026-08-10' && week.dateTo === '2026-08-16')

  const month = period.getSettlementsPeriodDates(period.SETTLEMENTS_PERIOD_PRESET.MONTH, ref)
  assert('month 01–31.08', month.dateFrom === '2026-08-01' && month.dateTo === '2026-08-31')

  const three = period.getSettlementsPeriodDates(
    period.SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS,
    ref
  )
  assert('three months 01.06–31.08', three.dateFrom === '2026-06-01' && three.dateTo === '2026-08-31')

  const prevWeek = period.shiftSettlementsPeriod(
    period.SETTLEMENTS_PERIOD_PRESET.WEEK,
    week.dateFrom,
    week.dateTo,
    -1
  )
  assert(
    'previous week 03–09.08',
    prevWeek.dateFrom === '2026-08-03' && prevWeek.dateTo === '2026-08-09'
  )

  const prevThree = period.shiftSettlementsPeriod(
    period.SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS,
    three.dateFrom,
    three.dateTo,
    -1
  )
  assert(
    'previous three months 01.03–31.05',
    prevThree.dateFrom === '2026-03-01' && prevThree.dateTo === '2026-05-31'
  )

  const nextThree = period.shiftSettlementsPeriod(
    period.SETTLEMENTS_PERIOD_PRESET.THREE_MONTHS,
    three.dateFrom,
    three.dateTo,
    1
  )
  assert(
    'next three months 01.09–30.11',
    nextThree.dateFrom === '2026-09-01' && nextThree.dateTo === '2026-11-30'
  )

  const feb = period.getMonthRangeKeys(2026, 2)
  assert('Feb 2026 end-of-month', feb.dateFrom === '2026-02-01' && feb.dateTo === '2026-02-28')

  const defaults = period.getSettlementsPeriodDefaults(ref)
  assert(
    'default = current month',
    defaults.periodPreset === period.SETTLEMENTS_PERIOD_PRESET.MONTH &&
      defaults.dateFrom === '2026-08-01'
  )
  assert(
    'filter inactive on current month',
    period.isSettlementsFilterActive('2026-08-01', '2026-08-31', ref) === false
  )
  assert(
    'filter active on week',
    period.isSettlementsFilterActive(week.dateFrom, week.dateTo, ref) === true
  )
  assert(
    'resolve today',
    period.resolveSettlementsPeriodPreset('2026-08-10', '2026-08-10', ref) ===
      period.SETTLEMENTS_PERIOD_PRESET.TODAY
  )
  assert(
    'resolve yesterday',
    period.resolveSettlementsPeriodPreset('2026-08-09', '2026-08-09', ref) ===
      period.SETTLEMENTS_PERIOD_PRESET.YESTERDAY
  )

  let day = { ...today }
  day = period.shiftSettlementsPeriod(period.SETTLEMENTS_PERIOD_PRESET.TODAY, day.dateFrom, day.dateTo, -1)
  day = period.shiftSettlementsPeriod(period.SETTLEMENTS_PERIOD_PRESET.TODAY, day.dateFrom, day.dateTo, -1)
  day = period.shiftSettlementsPeriod(period.SETTLEMENTS_PERIOD_PRESET.TODAY, day.dateFrom, day.dateTo, -1)
  assert(
    'today preset keeps day-step across 3 left shifts',
    day.dateFrom === '2026-08-07' && day.dateTo === '2026-08-07'
  )
  let yday = { ...yesterday }
  yday = period.shiftSettlementsPeriod(
    period.SETTLEMENTS_PERIOD_PRESET.YESTERDAY,
    yday.dateFrom,
    yday.dateTo,
    -1
  )
  yday = period.shiftSettlementsPeriod(
    period.SETTLEMENTS_PERIOD_PRESET.YESTERDAY,
    yday.dateFrom,
    yday.dateTo,
    1
  )
  assert(
    'yesterday preset round-trip shift restores 09.08',
    yday.dateFrom === '2026-08-09' && yday.dateTo === '2026-08-09'
  )

  const popover = read('src/components/suppliers/settlements/SettlementsFilterPopover.jsx')
  assert('popover uses settlementsPeriod util', popover.includes("from '../../../utils/settlementsPeriod'"))
  assert('popover has navigator', popover.includes('settlements-filter-popover__navigator'))
  assert('popover has yesterday tab', popover.includes('SETTLEMENTS_PERIOD_PRESET_OPTIONS'))
  assert('popover keeps periodPreset on shift', popover.includes('periodPreset: draft.periodPreset'))
  assert('popover uses role=group', popover.includes('role="group"'))
  assert('popover uses aria-pressed', popover.includes('aria-pressed={active}'))
  assert('popover has no role=tablist', !popover.includes('role="tablist"'))
  assert('panel uses describeSettlementsPeriod from util', read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx').includes('describeSettlementsPeriod'))
  assert(
    'panel uses isSettlementsFilterActive',
    read('src/components/suppliers/settlements/UmagSettlementsPanel.jsx').includes(
      'isSettlementsFilterActive'
    )
  )
}

function stageSyncButton() {
  console.log('Stage 4: Shared PlatformSyncButton')
  assert('PlatformSyncButton exists', exists('src/components/platform/PlatformSyncButton.jsx'))
  assert('PlatformSyncButton css exists', exists('src/components/platform/PlatformSyncButton.css'))
  const syncBtn = read('src/components/platform/PlatformSyncButton.jsx')
  const syncCss = read('src/components/platform/PlatformSyncButton.css')
  assert('uses PlatformToolbarIconButton', syncBtn.includes('PlatformToolbarIconButton'))
  assert('uses RefreshIcon', syncBtn.includes('RefreshIcon'))
  assert('aria-busy while syncing', syncBtn.includes('aria-busy'))
  assert('spinning class', syncBtn.includes('platform-sync-button__icon--spinning'))
  assert('reduced motion', syncCss.includes('prefers-reduced-motion'))

  const sites = [
    'src/components/procurement/ProcurementPlannerView.jsx',
    'src/components/suppliers/settlements/UmagSettlementsPanel.jsx',
    'src/components/suppliers/payments/SupplierPaymentsPanel.jsx',
    'src/components/suppliers/settlements/CreateReconciliationModal.jsx',
  ]
  for (const rel of sites) {
    const src = read(rel)
    assert(`${rel} uses PlatformSyncButton`, src.includes('PlatformSyncButton'))
    assert(
      `${rel} has no manual text sync button`,
      !src.includes('>Синхронизировать<') &&
        !src.includes("{syncing ? 'Синхронизация…' : 'Синхронизировать'}")
    )
  }

  assert(
    'planner removed local sync spin css',
    !read('src/components/procurement/ProcurementPlannerView.css').includes('proc-planner-sync-spin')
  )
  assert(
    'unused umag sync-btn css removed',
    !read('src/components/suppliers/settlements/UmagSettlementsPanel.css').includes(
      'umag-settlements__sync-btn'
    )
  )
  assert(
    'unused recon sync-btn css removed',
    !read('src/components/suppliers/settlements/CreateReconciliationModal.css').includes(
      'recon-create__sync-btn'
    )
  )
}

async function main() {
  console.log('verify-umag-sync-settlements-ux\n')
  await stageChunking()
  await stageErrorNormalization()
  await stagePeriodMath()
  stageSyncButton()
  console.log(`\nPassed ${testsPassed}/${testsRun}`)
}

main().catch((err) => {
  console.error(`\nFAILED after ${testsPassed}/${testsRun}:`, err.message)
  process.exitCode = 1
})
