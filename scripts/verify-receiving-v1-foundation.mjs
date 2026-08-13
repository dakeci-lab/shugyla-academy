#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MIGRATION = 'supabase/migrations/20260813231600_receiving_umag_v1_foundation.sql'

globalThis.__VITE_ENV__ = {}
register(pathToFileURL(path.join(__dirname, 'lib/extensionlessResolver.mjs')))

let checks = 0

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`)
  checks += 1
  console.log(`  ✓ ${name}`)
}

console.log('Receiving v1 foundation')

const sql = read(MIGRATION)
const functionHeaders = [
  ...sql.matchAll(/create\s+or\s+replace\s+function\s+([a-z_][\w.]*)\s*\(/gi),
].map((match) => match[1].toLowerCase())
const functionBlocks = [
  ...sql.matchAll(/create\s+or\s+replace\s+function\s+[a-z_][\w.]*\s*\([\s\S]*?\)\s*returns\b[\s\S]*?\bas\s+\$\$[\s\S]*?\$\$;/gi),
]
const startFunctionBlock = functionBlocks.find((match) =>
  /function\s+public\.receiving_start_v1\s*\(/i.test(match[0])
)
const startJsonReturns = startFunctionBlock?.[0].match(/return\s+jsonb_build_object\s*\([\s\S]*?\);/gi) || []
const functionsWithDuplicateJsonReturns = functionBlocks.filter((match) => {
  const returns = match[0]
    .match(/return\s+jsonb_build_object\s*\([\s\S]*?\);/gi) || []
  const normalizedReturns = returns.map((statement) =>
    statement.trim().replace(/\s+/g, ' ').toLowerCase()
  )
  return new Set(normalizedReturns).size !== normalizedReturns.length
})
const significantSqlLines = sql
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/\s+/g, ' ').toLowerCase())
  .filter((line) => line && !line.startsWith('--'))
const adjacentSyntaxDuplicates = significantSqlLines.filter(
  (line, index) => index > 0 && line === significantSqlLines[index - 1] && !/^(?:end;|end if;|\$\$;|\);|'.*',)$/.test(line)
)
check('migration is additive', !/\bdrop\s+table\b|\btruncate\b/i.test(sql))
check('every SQL function has one complete dollar-quoted body', functionBlocks.length === functionHeaders.length)
check('SQL function declarations are unique inside the migration', new Set(functionHeaders).size === functionHeaders.length)
check('receiving_start_v1 has exactly one reachable JSON return', startJsonReturns.length === 1)
check('function bodies contain no duplicated JSON return statements', functionsWithDuplicateJsonReturns.length === 0)
check('migration has no adjacent duplicated syntax lines', adjacentSyntaxDuplicates.length === 0)
check(
  'one live receipt per order preserves cancelled history',
  /create unique index[^;]+purchase_order_id[\s\S]+status <> 'cancelled'/i.test(sql)
)
check('invoice numbers are stored as text array', /supplier_invoice_numbers text\[\]/.test(sql))
check('document optimistic version is stored', /add column if not exists version bigint/.test(sql))
check('actual price is separate from ordered purchase_price', /actual_purchase_price numeric/.test(sql))
check('receipt lines add missing sort_order additively', /add column if not exists sort_order integer/.test(sql))
check('unit is persisted on order and receipt lines', /alter table public\.purchase_order_items[\s\S]+add column if not exists unit/.test(sql) && /alter table public\.receiving_items[\s\S]+add column if not exists unit/.test(sql))
check('UMAG measure is inherited by generated orders', /purchase_order_items_fill_unit_v1/.test(sql) && /i\.measure/.test(sql))
check('outside order lines require exact barcode snapshot lookup', /where i\.barcode = v_barcode/.test(sql) && /latest usable procurement snapshot/i.test(sql))
check('completion always writes received', /case when p_complete then 'received' else 'in_progress'/.test(sql))
check('completion creates an immutable version snapshot', /insert into public\.receiving_document_versions/.test(sql))
check('export history records document and export versions', /receiving_umag_exports[\s\S]+document_version bigint[\s\S]+export_version bigint/.test(sql))
check('export history rejects a stale export version', /p_expected_export_version bigint[\s\S]+v_doc\.export_version <> p_expected_export_version/.test(sql))
check('all write RPCs are security definer', (sql.match(/security definer/g) || []).length >= 7)
check('write RPCs pin an empty search_path', (sql.match(/set search_path = ''/g) || []).length >= 7)
check('public and anon cannot call receiving writes', /revoke all on function public\.receiving_complete_v1[\s\S]+from public, anon/.test(sql))
check('new history tables enable RLS', /alter table public\.receiving_document_versions enable row level security/.test(sql) && /alter table public\.receiving_umag_exports enable row level security/.test(sql))
check('discrepancy photo bucket is private and capped at 10 MB', /receiving-discrepancy-photos[\s\S]+false,[\s\S]+10485760/.test(sql))
check('discrepancy photo bucket restricts supported image MIME types', /array\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/heic'\]/.test(sql))
check('photo storage path is restricted to document and item UUID folders', /\(storage\.foldername\(name\)\)\[1\] = 'documents'[\s\S]+\(storage\.foldername\(name\)\)\[3\] ~\*/.test(sql))
check('private photos require receiving permissions', /receiving_discrepancy_photos_select[\s\S]+receiving\.view[\s\S]+receiving\.manage/.test(sql))
check('write RPC accepts only durable private photo paths', /photo_path\.value !~\*[\s\S]+\^documents\//.test(sql))
check('migration has no duplicated purchase item FROM clause', !/from public\.purchase_order_items as i\s+from public\.purchase_order_items as i/.test(sql))
check('discrepancy reason assignment is not duplicated', (sql.match(/discrepancy_reason_code = nullif\(btrim\(coalesce\(/g) || []).length === 1)

const receiving = await import(pathToFileURL(path.join(ROOT, 'src/utils/receivingData.js')).href)
const item = receiving.normalizeReceivingItem({
  ordered_qty: 3,
  received_qty: 2.5,
  purchase_price: 100,
  actual_purchase_price: 120,
  unit: 'кг',
  is_outside_order: false,
  discrepancy_reason: 'Недопоставка',
  photo_urls: ['documents/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg'],
})
check('normalizer keeps ordered price snapshot', item.orderedPurchasePrice === 100 && item.purchasePrice === 100)
check('normalizer exposes actual price and difference', item.actualPurchasePrice === 120 && item.priceDifference === 20)
check('normalizer preserves unit and discrepancy', item.unit === 'кг' && item.discrepancyReason === 'Недопоставка')
check('normalizer preserves persisted photo URLs', item.photoUrls.length === 1)
check('normalizer separates durable photo paths from display URLs', item.photoPaths[0] === item.photoUrls[0])
const signedUrl = 'https://storage.example.test/object/sign/receiving/photo.jpg?token=secret'
const displayPhoto = receiving.normalizeReceivingItem({ photoUrls: [signedUrl] })
check('signed display URL never becomes a durable photo path', displayPhoto.photoUrls[0] === signedUrl && displayPhoto.photoPaths.length === 0)
const legacySignedPhoto = receiving.normalizeReceivingItem({ photo_urls: [signedUrl] })
check('legacy signed URL is discarded instead of persisted again', legacySignedPhoto.photoPaths.length === 0 && legacySignedPhoto.photoUrls.length === 0)

const photos = await import(pathToFileURL(path.join(ROOT, 'src/services/receivingPhotoUtils.js')).href)
const photoFile = { name: 'damage.JPG', type: 'image/jpeg', size: 1024 }
check('photo validator accepts supported files', photos.validateReceivingPhotoFile(photoFile).extension === 'jpg')
check('photo validator normalizes HEIF camera MIME to HEIC', photos.validateReceivingPhotoFile({ name: 'damage.heic', type: 'image/heif', size: 1024 }).contentType === 'image/heic')
let oversizedRejected = false
try {
  photos.validateReceivingPhotoFile({ name: 'huge.jpg', type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })
} catch {
  oversizedRejected = true
}
check('photo validator rejects files over 10 MB', oversizedRejected)
const photoPath = photos.buildReceivingPhotoPath(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'jpg'
)
check('photo path follows document/item/uuid contract', /^documents\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/[0-9a-f-]+\.jpg$/i.test(photoPath))
check('photo storage validator accepts generated durable path', photos.isReceivingPhotoStoragePath(photoPath))
check('photo storage validator rejects signed URL', !photos.isReceivingPhotoStoragePath(signedUrl))

const totals = receiving.calcReceivingTotals([item])
check('totals use actual accepted quantity and price', totals.totalReceivedAmount === 300)
check('completed receipt status is received even with discrepancy', receiving.resolveReceivingCompleteStatus([item]) === receiving.RECEIVING_STATUS.RECEIVED)

const cloud = read('src/services/receivingSupabaseAdapter.js')
const local = read('src/services/receivingLocalAdapter.js')
const service = read('src/services/receivingDataService.js')
check('cloud saves and completes through atomic RPCs', /receiving_save_v1/.test(cloud) && /receiving_complete_v1/.test(cloud))
check('cloud supports start and export history operations', /receiving_start_v1/.test(cloud) && /receiving_record_umag_export_v1/.test(cloud))
check('cloud stores private paths and signs them only when loading detail', /createSignedUrls/.test(cloud) && /photo_urls: normalizeReceivingPhotoStoragePaths\(normalized\.photoPaths\)/.test(cloud))
check('cloud maps database photo_urls to durable photo_paths', /photo_paths: row\.photo_urls/.test(cloud))
check('cloud uploads pending photos without upsert', /uploadReceivingItemPhotosCloud/.test(cloud) && /upsert: false/.test(cloud))
check('service routes start and export history in both modes', /startReceivingDocumentCloud/.test(service) && /recordReceivingUmagExportLocal/.test(service))
check('service routes photo upload in both modes', /uploadReceivingItemPhotosCloud/.test(service) && /uploadReceivingItemPhotosLocal/.test(service))
check('local adapter tracks optimistic versions', /assertExpectedVersion/.test(local) && /version: Number\(/.test(local))
check('local and cloud both reject stale export history versions', /metadata\.expectedExportVersion/.test(local) && /p_expected_export_version: metadata\.expectedExportVersion/.test(cloud))
check('local adapter persists photos as data URLs', /readReceivingPhotoAsDataUrl/.test(local) && /storedLocally: true/.test(local))

const cloudAdapter = await import(
  pathToFileURL(path.join(ROOT, 'src/services/receivingSupabaseAdapter.js')).href
)
const cloudRow = cloudAdapter.itemToRow(
  {
    id: '33333333-3333-4333-8333-333333333333',
    photoPaths: [photoPath],
    photoUrls: [signedUrl],
  },
  '11111111-1111-4111-8111-111111111111'
)
check('cloud row persists the private path rather than its signed URL', cloudRow.photo_urls.length === 1 && cloudRow.photo_urls[0] === photoPath)
const signedOnlyCloudRow = cloudAdapter.itemToRow(
  {
    id: '33333333-3333-4333-8333-333333333333',
    photoUrls: [signedUrl],
  },
  '11111111-1111-4111-8111-111111111111'
)
check('cloud row cannot persist a signed-only photo reference', signedOnlyCloudRow.photo_urls.length === 0)

const detail = read('src/pages/platform/receiving/ReceivingDetailPage.jsx')
check('detail uploads pending photos before save and complete', (detail.match(/await uploadPendingPhotos\(\)/g) || []).length === 2)
check('detail sends document and export optimistic versions to history', /expectedVersion: document\.version/.test(detail) && /expectedExportVersion: document\.exportVersion/.test(detail))
check('history is recorded before the prepared binary is downloaded', detail.indexOf('await recordReceivingUmagExport') < detail.indexOf('await downloadReceivingUmagXlsxBytes'))

console.log(`\nOK: ${checks} checks passed.`)
