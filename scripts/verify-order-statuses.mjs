#!/usr/bin/env node
/**
 * Verification for order statuses «Черновик / Сохранён» (stage 25, docs/procurement/order-lifecycle/final-statuses.md):
 * who sees which status, which action leads where, server transitions, planning «в пути».
 * Pure-logic checks run the real helpers; UI checks assert on source.
 *
 * Usage:
 *   npm run verify:order-statuses
 */

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// App sources are written for Vite: extensionless imports, JSON imports and
// import.meta.env. Empty env keeps the app in local mode — no Supabase, no network.
globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

const DETAIL_PAGE = 'src/pages/platform/procurement/PurchaseDetailPage.jsx'
const LIST_PAGE = 'src/pages/platform/orders/OrdersPage.jsx'
const PURCHASE_CLOUD = 'src/services/purchaseSupabaseAdapter.js'
const PURCHASE_LOCAL = 'src/services/purchaseLocalAdapter.js'
const PURCHASE_SERVICE = 'src/services/purchaseDataService.js'
const RECEIVING_CLOUD = 'src/services/receivingSupabaseAdapter.js'
const RECEIVING_LOCAL = 'src/services/receivingLocalAdapter.js'
const PLANNER_VIEW = 'src/components/procurement/ProcurementPlannerView.jsx'
const RPC_MIGRATION = 'supabase/migrations/20260812041000_procurement_order_state_rpc.sql'

let checks = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  if (!condition) fail(`${name}${detail ? ` — ${detail}` : ''}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) fail(`file not found: ${relPath}`)
  return fs.readFileSync(full, 'utf8')
}

async function load(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href)
}

// ---------------------------------------------------------------------------
// Stage 1 — the rule itself
// ---------------------------------------------------------------------------

async function stageRules() {
  console.log('Stage 1: Two statuses')

  const purchase = await load('src/utils/purchaseData.js')
  const { PURCHASE_STATUS, isOrderDraft, isOrderSaved, isOrderVisibleToRole } = purchase

  assert('there are exactly two statuses: draft and saved', JSON.stringify(Object.values(PURCHASE_STATUS).sort()) === JSON.stringify(['draft', 'saved']))
  assert('the buyer sees drafts', isOrderVisibleToRole({ status: 'draft' }, true))
  assert('the receiver never sees drafts', !isOrderVisibleToRole({ status: 'draft' }, false))
  assert('both see saved orders', isOrderVisibleToRole({ status: 'saved' }, false) && isOrderVisibleToRole({ status: 'saved' }, true))
  assert('an unknown status is visible to nobody', !isOrderVisibleToRole({ status: 'cancelled' }, true))
  assert('isOrderDraft / isOrderSaved are exclusive', isOrderDraft({ status: 'draft' }) && !isOrderSaved({ status: 'draft' }) && isOrderSaved({ status: 'saved' }))

  const labels = purchase.PURCHASE_STATUS_LABELS
  assert('labels are «Черновик» and «Сохранён»', labels.draft === 'Черновик' && labels.saved === 'Сохранён')

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 2 — service layer wiring
// ---------------------------------------------------------------------------

function stageServices() {
  console.log('Stage 2: Service layer')

  const cloud = read(PURCHASE_CLOUD)
  const local = read(PURCHASE_LOCAL)
  const service = read(PURCHASE_SERVICE)

  assert('«Сохранить» goes through procurement_submit_order', /submitPurchaseOrderCloud[\s\S]{0,300}'procurement_submit_order'/.test(cloud))
  assert('«Отменить» goes through procurement_unsave_order', /unsavePurchaseOrderCloud[\s\S]{0,300}'procurement_unsave_order'/.test(cloud))
  assert('deleting a draft goes through procurement_delete_draft_order', /procurement_delete_draft_order/.test(cloud))
  assert('cloud transitions use one RPC call (no client-side two-table writes)', /supabase\.rpc\(fnName, \{ p_order_id: orderId \}\)/.test(cloud))
  assert('the orchestrator routes both modes', /submitPurchaseOrderCloud\(orderId\)/.test(service) && /local\.submitPurchaseOrder\(orderId\)/.test(service) && /unsavePurchaseOrderCloud\(orderId\)/.test(service) && /local\.unsavePurchaseOrder\(orderId\)/.test(service))
  assert('each transition puts the returned order into the cache (no full reload)', /export async function savePurchaseOrder[\s\S]{0,300}afterOrderChange\(orderId, result\)/.test(service) && /export async function cancelSavedPurchaseOrder[\s\S]{0,300}afterOrderChange\(orderId, result\)/.test(service) && /export async function deletePurchaseOrder[\s\S]{0,300}afterOrderChange\(orderId, null\)/.test(service))
  assert('the order card does not trigger a full reload after an action', !/\brefresh\(\)/.test(read(DETAIL_PAGE)) && /notifyChange\(\)/.test(read(DETAIL_PAGE)))
  assert('the client no longer syncs receiving documents on order updates', !/syncSimpleReceivingFromPurchaseCloud/.test(cloud) && !/syncSimpleReceivingFromPurchaseLocal\(/.test(local))
  assert('a manually created order is «simple» (RLS allows its insert)', /workflowMode: PROCUREMENT_WORKFLOW_MODE\.SIMPLE,\s*\},\s*\{ id, created_at/.test(cloud))
  assert('the receiving layer is gone from the app (stage 25c)', ['src/services/receivingDataService.js', 'src/services/receivingSupabaseAdapter.js', 'src/services/receivingLocalAdapter.js', 'src/utils/receivingData.js', 'src/services/purchaseOptimisticStore.js'].every((file) => !fs.existsSync(path.join(ROOT, file))))
  assert('orders no longer carry receiving fields', !/receiving_document_id|transferred_to_receiving/.test(cloud) && !/transferredToReceiving|receivingDocumentId/.test(read("src/utils/purchaseData.js")))
  assert('local delete only allows a draft', /status !== PURCHASE_STATUS\.DRAFT[\s\S]{0,200}Удалить можно только черновик/.test(local))
  assert('local save refuses an empty order and zero quantities', /нет товаров/.test(local) && /нулевым количеством/.test(local))

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 2b — the RPC migration
// ---------------------------------------------------------------------------

function stageRpcMigration() {
  console.log('Stage 2b: Transactional RPC migration')

  const sql = read(RPC_MIGRATION)

  for (const fn of ['procurement_return_order_to_draft', 'procurement_cancel_order']) {
    const body = sql.slice(
      sql.indexOf(`create or replace function public.${fn}(`),
      sql.indexOf(`comment on function public.${fn}(`)
    )
    assert(`${fn} is defined`, body.length > 0)
    assert(`${fn} is security definer`, /security definer/.test(body))
    assert(`${fn} pins search_path`, /set search_path = ''/.test(body))
    assert(`${fn} locks the order row`, /from public\.purchase_orders[\s\S]{0,120}for update/.test(body))
    assert(
      `${fn} locks live receiving documents`,
      /from public\.receiving_documents as d[\s\S]{0,200}for update/.test(body)
    )
    const receivingLockAt = body.search(/from public\.receiving_documents as d[\s\S]{0,200}for update/)
    assert(
      `${fn} re-checks receiving state only after locking`,
      receivingLockAt >= 0 && receivingLockAt < body.indexOf('into v_receiving_started'),
      'reading the guard before the lock leaves a race'
    )
    assert(
      `${fn} never touches procurement_snapshots`,
      !/procurement_snapshot/.test(body)
    )
    assert(
      `${fn} cancels the receiving documents of the order`,
      /update public\.receiving_documents[\s\S]{0,200}set status = 'cancelled'/.test(body),
      'otherwise the warehouse keeps waiting'
    )
    assert(
      `${fn} writes the order row too`,
      /update public\.purchase_orders[\s\S]{0,300}where id = p_order_id/.test(body),
      'both writes must live in the same transaction'
    )
    assert(
      `${fn} requires procurement.edit`,
      /perform auth_private\.require_procurement_edit\(\)/.test(body)
    )
    assert(
      `${fn} speaks Russian to the user`,
      /raise exception '[А-Яа-яЁё]/.test(body),
      'raw English must never reach the buyer'
    )
    assert(
      `${fn} owner is reset to postgres`,
      new RegExp(`alter function public\\.${fn}\\(uuid\\) owner to postgres`).test(sql)
    )
    assert(
      `${fn} execute is revoked from public and anon`,
      new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from public`).test(sql) &&
        new RegExp(`revoke all on function public\\.${fn}\\(uuid\\) from anon`).test(sql)
    )
    assert(
      `${fn} execute is granted only to authenticated and service_role`,
      new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to authenticated`).test(sql) &&
        new RegExp(`grant execute on function public\\.${fn}\\(uuid\\) to service_role`).test(sql)
    )
  }

  assert(
    'the permission guard checks an authenticated user',
    /require_procurement_edit[\s\S]{0,500}auth\.uid\(\) is null/.test(sql)
  )
  assert(
    'the permission guard checks procurement.edit',
    /current_user_has_permission\('procurement\.edit'\)/.test(sql)
  )
  // Comments legitimately mention the table; only real statements matter.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  assert(
    'the migration grants no new privilege on procurement_snapshots',
    !/grant[^;]*procurement_snapshots/i.test(statements)
  )
  assert(
    'the migration touches no snapshot table at all',
    !/procurement_snapshot/i.test(statements)
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 3 — order card
// ---------------------------------------------------------------------------

function stageDetailPage() {
  console.log('Stage 3: Order card')

  const src = read(DETAIL_PAGE)

  assert('card has «Сохранить» for a draft', /canEdit && draft && \(/.test(src) && />\s*Сохранить\s*</.test(src))
  assert('card has «Отменить» for a saved order', /canEdit && saved && \(/.test(src) && />\s*Отменить\s*</.test(src))
  assert('a draft can be deleted for good, with a confirmation', src.includes('Удалить черновик') && /handleDeleteDraft[\s\S]{0,600}window\.confirm/.test(src))
  assert('«Отменить» explains the order goes back to a draft', /Он вернётся в черновик/.test(src))
  assert('items are editable only in a draft', /const canEditItems = canEdit && draft/.test(src))
  assert('the «Сверено» mark exists only on a saved order', /const canShowCheckedMark = saved/.test(src))
  assert('delivery date and comment are editable in a draft', /canEditItems \? \(\s*<span className="purchase-detail__date-edit"/.test(src) && /handleMetaChange\(\{ comment/.test(src))
  assert('the receiver cannot open a draft', /isOrderDraft\(order\) && !canEdit/.test(src))
  assert('no receiving handoff left in the card', !/transferPurchaseToReceiving|canTransferToReceiving|RECEIVING_STARTED_MESSAGE|receivingStarted/.test(src))

  // One download button with a compact menu — owner's requirement.
  assert('single download button', src.includes('aria-label="Скачать заказ"'))
  assert(
    'the two separate export icons are gone',
    !src.includes('aria-label="Экспорт Excel"') && !src.includes('aria-label="Экспорт PDF"')
  )
  assert('download button opens a menu', /aria-haspopup="menu"/.test(src))
  assert(
    'menu offers Excel and PDF',
    /role="menuitem"[\s\S]{0,200}Excel/.test(src) && /role="menuitem"[\s\S]{0,200}PDF/.test(src)
  )
  assert(
    'menu closes on outside click and Escape',
    /mousedown/.test(src) && /event\.key === 'Escape'/.test(src)
  )
  assert('menu closes once an export starts', /setExportMenuOpen\(false\)/.test(src))

  // No raw error text reaches the buyer.
  assert(
    'errors are mapped to Russian',
    !/err\.message \|\|/.test(src) && src.includes('toProcurementUserMessage')
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 3b — planner: quantity needs a selected supplier
// ---------------------------------------------------------------------------

async function stagePlanner() {
  console.log('Stage 3b: Planning quantity gate')

  const ux = await load('src/utils/procurementPlannerUx.js')
  const { canEditItemQuantity, QUANTITY_REQUIRES_SUPPLIER_HINT } = ux

  const supplierA = 'aaaaaaaa-0000-4000-8000-000000000001'
  const supplierB = 'bbbbbbbb-0000-4000-8000-000000000002'
  const item = { id: 'i1', platform_supplier_id: supplierA }
  const filterOptions = { suppliers: [{ id: supplierA }, { id: supplierB }] }

  assert(
    'no supplier selected → quantity is not editable',
    !canEditItemQuantity(item, { filterOptions, selectedSupplierId: '' })
  )
  assert(
    'supplier selected → its own rows are editable',
    canEditItemQuantity(item, { filterOptions, selectedSupplierId: supplierA })
  )
  assert(
    'rows of another supplier stay locked',
    !canEditItemQuantity(item, { filterOptions, selectedSupplierId: supplierB })
  )
  // Повторный заказ тому же поставщику разрешён: прошлый заказ больше не блокирует ввод.
  assert(
    'a row already in a generated order stays editable for the next order',
    canEditItemQuantity(
      { ...item, generated_purchase_order_id: 'po-1' },
      { filterOptions, selectedSupplierId: supplierA }
    )
  )
  assert(
    'a supplier whose order is created can be ordered again',
    canEditItemQuantity(item, {
      filterOptions: { suppliers: [{ id: supplierA, generatedOrderId: 'po-1' }] },
      selectedSupplierId: supplierA,
    })
  )
  assert('missing item is never editable', !canEditItemQuantity(null, { selectedSupplierId: supplierA }))
  assert('hint text is Russian', /[А-Яа-яЁё]/.test(QUANTITY_REQUIRES_SUPPLIER_HINT))

  const view = read(PLANNER_VIEW)
  assert(
    'the input is replaced by a dash when not editable',
    /!canEditQuantity\(item\)/.test(view) && /proc-planner__qty-value is-empty/.test(view)
  )
  // Раньше проверялось имя handleFinalChange — обработчик давно называется
  // commitQuantity, из-за чего проверка была «красной» ещё до этой задачи.
  assert(
    'the save handler guards against a stale blur event',
    /async function commitQuantity[\s\S]{0,600}if \(!canEditQuantity\(item\)\)[\s\S]{0,400}return \{ ok: false/.test(
      view
    )
  )
  assert(
    'reset is guarded too',
    /async function handleReset[\s\S]{0,120}if \(!canEditQuantity\(item\)\) return/.test(view)
  )
  assert(
    'the gate consults the selected supplier filter',
    /selectedSupplierId: filters\.platformSupplierId/.test(view)
  )
  assert(
    'planner errors are mapped to Russian',
    !/err\.message \|\|/.test(view) && view.includes('toProcurementUserMessage')
  )

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 4 — list filter
// ---------------------------------------------------------------------------

function stageListPage() {
  console.log('Stage 4: Orders list')

  const src = read(LIST_PAGE)

  assert('the receiver gets only saved orders (drafts are filtered by role)', /isOrderVisibleToRole\(order, canEdit\)/.test(src))
  assert('drafts are listed first and ignore the period', /const drafts = visible\.filter\(isOrderDraft\)/.test(src) && /\[\.\.\.drafts, \.\.\.saved\]/.test(src))
  assert('the «Сегодня ждём…» summary counts saved orders only', /summarizeOrders\(orders\.filter\(isOrderSaved\)\)/.test(src))
  assert('«Новый заказ» creates a draft and opens it', src.includes('+ Новый заказ') && /createPurchaseOrder\(/.test(src) && /navigate\(`\/platform\/orders\/\$\{id\}`\)/.test(src))
  assert('the list no longer loads the receiving module', !/'receiving'\]/.test(src))
  assert('the «show cancelled» filter is gone (no cancelled status any more)', !/showCancelled/.test(src))
  assert('the orders list can be retried after a failed load (the error banner has «Повторить»)', />\s*Повторить\s*</.test(src) && /reloadProcurement\(\)/.test(src))
  assert('a failed procurement reload is retried once before the module is marked as failed', /withOneRetry\(\(\) => supabaseAdapter\.fetchPurchasesModuleData\(\)\)/.test(read('src/services/platformDataService.js')))
  assert('the card loads its own items and keeps the previous order on screen while refreshing', /itemsReady/.test(read(DETAIL_PAGE)) && /setFullOrder\(\(prev\) =>/.test(read(DETAIL_PAGE)) && /Загрузка товаров/.test(read(DETAIL_PAGE)))
  assert('the legacy analytics page is gone and its URLs redirect to the orders list', !fs.existsSync(path.join(ROOT, 'src/pages/platform/procurement/AnalyticsProcurementPage.jsx')) && /path="procurement\/analytics" element=\{<Navigate to="\/platform\/orders"/.test(read('src/App.jsx')))

  console.log('')
}

// ---------------------------------------------------------------------------
// Stage 5 — database migration
// ---------------------------------------------------------------------------

function stageMigration() {
  console.log('Stage 5: Stage 25 migrations')
  const sql = read('supabase/migrations/20261028100000_order_statuses_rpc.sql')
  assert('submit refuses an empty order and zero quantities', /procurement_submit_order/.test(sql) && /нет товаров/.test(sql) && /нулевым количеством/.test(sql))
  const unsave = sql.slice(sql.indexOf('function public.procurement_unsave_order'), sql.indexOf('function public.procurement_submit_order'))
  assert('unsave clears the «Сверено» mark and does not give quantities back to the plan', /checked_at = null/.test(unsave) && !/procurement_snapshot_items/.test(unsave))
  assert('«в пути» counts saved orders only (drafts and cancelled do not)', /po\.status in \('saved', 'awaiting_receiving', 'formed', 'sent', 'partially_received'\)/.test(sql))
  assert('draft editing policies exist for orders and items', ['purchase_orders_update_draft', 'purchase_order_items_insert_draft', 'purchase_order_items_update_draft', 'purchase_order_items_delete_draft'].every((name) => sql.includes(name)))
  const del = read('supabase/migrations/20261028100100_order_delete_draft.sql')
  assert('deleting a draft refuses a saved order and gives planner quantities back', /v_order\.status <> 'draft'/.test(del) && /generated_purchase_order_id = null/.test(del))
  const cut = read('supabase/migrations/20261028120000_order_statuses_cutover.sql')
  assert('planner orders are created as saved, without receiving documents', /'saved',\s*v_today/.test(cut) && !/insert into public\.receiving_/.test(cut))
  assert('«в пути» counts saved orders only after the cutover', /po\.status = 'saved'/.test(cut))
  assert('legacy statuses are renamed to saved', /set status = 'saved'[\s\S]{0,200}'awaiting_receiving', 'received'/.test(cut))
  assert('«Сверено» goes through a server function', /procurement_set_order_checked/.test(cut) && /setOrderCheckedCloud/.test(read(PURCHASE_CLOUD)) && /procurement_set_order_checked/.test(read(PURCHASE_CLOUD)))
  const clean = read('supabase/migrations/20261028120100_order_statuses_cleanup.sql')
  assert('cleanup runs in one transaction without CASCADE / IF EXISTS', /^begin;/m.test(clean) && /^commit;/m.test(clean) && !/cascade|if exists/i.test(clean))
  assert('cleanup limits the status to draft / saved and closes the old direct-edit policies', /check \(status in \('draft', 'saved'\)\)/.test(clean) && (clean.match(/drop policy/g) || []).length === 5)
  const rm = read('supabase/migrations/20261028140100_remove_receiving.sql')
  assert('stage 25c removal runs in one transaction without CASCADE / IF EXISTS', /^begin;/m.test(rm) && /^commit;/m.test(rm) && !/cascade|if exists/i.test(rm.replace(/--.*$/gm, '')))
  assert('stage 25c drops the four receiving tables children-first', ['receiving_umag_exports', 'receiving_document_versions', 'receiving_items', 'receiving_documents'].map((t) => rm.indexOf(`drop table public.${t};`)).every((v, i, a) => v > -1 && (i === 0 || v > a[i - 1])))
  assert('deleting a draft no longer touches receiving documents', !/delete from public\.receiving_documents/.test(rm))
  const rpc2 = read('supabase/migrations/20261028140000_order_rpc_without_receiving.sql')
  assert('save / cancel functions do not touch receiving documents', !/receiving/.test(rpc2.replace(/--.*$/gm, '')))
  const num = read('supabase/migrations/20261029120000_order_numbers.sql')
  assert('document numbers start at 1001 and are given by a trigger when an order becomes saved (any path)', /start with 1001/.test(num) && /new\.status = 'saved' and new\.number is null/.test(num) && /before insert or update of status/.test(num))
  assert('a number is unique and never reused (sequence, partial unique index)', /create unique index purchase_orders_number_key/.test(num) && /nextval\('public\.purchase_order_number_seq'\)/.test(num))
  assert('existing saved orders are numbered in creation order', /row_number\(\) over \(order by created_at, id\)/.test(num))
  const labelsSrc = read('src/config/documentLabels.js')
  assert('exports and the card show the number («Заказ поставщику №N», file name, card title)', /formatOrderTitle\(mapped\.number\)/.test(read('src/utils/purchaseOrderExport.js')) && /Заказ №\{order\.number\}/.test(read(DETAIL_PAGE)) && /export function formatOrderTitle/.test(labelsSrc))
  assert('the orders list has a «Номер» column', /key: 'number'/.test(read('src/components/procurement/PurchaseTable.jsx')))
  // Lesson of the 25c incident: PostgreSQL does not check function bodies when a column is dropped, so the LATEST definition of every
  // function that writes purchase_orders must not name the dropped receiving columns.
  const migrationsDir = path.join(ROOT, 'supabase/migrations')
  const latestGenerate = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort().map((f) => ({ f, sql: read(`supabase/migrations/${f}`) })).filter(({ sql }) => /create or replace function public\.generate_procurement_orders_from_snapshot\(p_snapshot_id uuid, p_expected_delivery_date date, p_supplier_ids/.test(sql)).pop()
  assert('the latest order-generation function no longer writes the dropped receiving columns', latestGenerate && !/transferred_to_receiving|receiving_document_id\b/.test(latestGenerate.sql.replace(/--.*$/gm, '')), latestGenerate?.f)
  console.log('')
}

async function main() {
  console.log('=== Order statuses verification ===\n')
  await stageRules()
  stageServices()
  stageRpcMigration()
  stageDetailPage()
  await stagePlanner()
  stageListPage()
  stageMigration()
  console.log(`=== All ${checks} checks passed ===\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  process.exit(1)
})
