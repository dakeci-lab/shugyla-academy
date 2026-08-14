import { supabase } from '../lib/supabaseClient'
import {
  normalizeReceivingDocument,
  normalizeReceivingItem,
  calcReceivingTotals,
  calcDifferenceQty,
  isReceivingStarted,
  RECEIVING_STATUS,
  RECEIVING_ITEM_STATUS,
} from '../utils/receivingData'
import {
  ANALYTICS_DIRECT_WRITE_MESSAGE,
  PURCHASE_STATUS,
  PROCUREMENT_WORKFLOW_MODE,
  isSimpleWorkflow,
} from '../utils/purchaseData'
import {
  DEFAULT_IN_FILTER_CHUNK_SIZE,
  DEFAULT_POSTGREST_PAGE_SIZE,
  fetchAllRowsByIdChunks,
} from '../utils/chunkArray'
import { throwUserError, toUserErrorMessage } from '../utils/userErrorMessage'
import { fetchOrderById } from './purchaseSupabaseAdapter'
import {
  buildReceivingPhotoPath,
  normalizeReceivingPhotoStoragePaths,
  RECEIVING_PHOTO_BUCKET,
  RECEIVING_PHOTO_SIGNED_URL_TTL_SECONDS,
  validateReceivingPhotoFile,
} from './receivingPhotoUtils'

function throwIfError(result, context, fallback = 'Не удалось сохранить данные.') {
  return throwUserError(result, context, fallback)
}

function refuseAnalyticsDirectWrite(entity) {
  if (isSimpleWorkflow(entity)) return
  throw new Error(ANALYTICS_DIRECT_WRITE_MESSAGE)
}

async function fetchPurchaseWorkflow(purchaseOrderId) {
  if (!purchaseOrderId) return null
  const result = await supabase
    .from('purchase_orders')
    .select('id, workflow_mode')
    .eq('id', purchaseOrderId)
    .maybeSingle()
  return throwIfError(result, 'Проверка типа закупа')
}

function ensureClient() {
  if (!supabase) throw new Error(toUserErrorMessage('Supabase не настроен', 'Сервер не настроен'))
}

function rowToItem(row) {
  return normalizeReceivingItem({
    id: row.id,
    receiving_document_id: row.receiving_document_id,
    purchase_order_item_id: row.purchase_order_item_id,
    product_name: row.product_name,
    barcode: row.barcode,
    unit: row.unit,
    ordered_qty: row.ordered_qty,
    received_qty: row.received_qty,
    difference_qty: row.difference_qty,
    purchase_price: row.purchase_price,
    actual_purchase_price: row.actual_purchase_price,
    is_outside_order: row.is_outside_order,
    discrepancy_reason: row.discrepancy_reason,
    discrepancy_reason_code: row.discrepancy_reason_code,
    photo_paths: row.photo_urls,
    photo_metadata: row.photo_metadata,
    status: row.status,
    comment: row.comment,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

function itemToRow(item, documentId) {
  const normalized = normalizeReceivingItem(item)
  const orderedQty = normalized.orderedQty
  const receivedQty = normalized.receivedQty
  const now = new Date().toISOString()

  const row = {
    id: item.id || crypto.randomUUID(),
    receiving_document_id: documentId,
    purchase_order_item_id: item.purchaseOrderItemId ?? item.purchase_order_item_id ?? null,
    product_name: item.productName ?? item.product_name ?? '',
    barcode: item.barcode ?? '',
    unit: item.unit ?? item.measure ?? '',
    ordered_qty: orderedQty,
    received_qty: receivedQty,
    difference_qty: calcDifferenceQty(receivedQty, orderedQty),
    purchase_price: item.purchasePrice ?? item.purchase_price ?? 0,
    actual_purchase_price:
      item.actualPurchasePrice ??
      item.actual_purchase_price ??
      item.purchasePrice ??
      item.purchase_price ??
      0,
    is_outside_order: Boolean(item.isOutsideOrder ?? item.is_outside_order),
    discrepancy_reason: item.discrepancyReason ?? item.discrepancy_reason ?? null,
    discrepancy_reason_code:
      item.discrepancyReasonCode ?? item.discrepancy_reason_code ?? null,
    photo_urls: normalizeReceivingPhotoStoragePaths(normalized.photoPaths),
    photo_metadata: item.photoMetadata ?? item.photo_metadata ?? [],
    status: item.status ?? RECEIVING_ITEM_STATUS.PENDING,
    comment: item.comment ?? '',
    sort_order: item.sortOrder ?? item.sort_order ?? 0,
    updated_at: now,
  }

  if (item.createdAt || item.created_at) {
    row.created_at = item.createdAt ?? item.created_at
  }

  return row
}

function rowToDocument(row, items = []) {
  return normalizeReceivingDocument(
    {
      id: row.id,
      purchase_order_id: row.purchase_order_id,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      status: row.status,
      expected_delivery_date: row.expected_delivery_date,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      received_by: row.received_by,
      received_by_name: row.received_by_name,
      supplier_invoice_numbers: row.supplier_invoice_numbers,
      comment: row.comment,
      total_ordered_qty: row.total_ordered_qty,
      total_received_qty: row.total_received_qty,
      total_difference_qty: row.total_difference_qty,
      total_amount: row.total_amount,
      total_received_amount: row.total_received_amount,
      version: row.version,
      started_at: row.started_at,
      completed_at: row.completed_at,
      export_version: row.export_version,
      last_exported_at: row.last_exported_at,
      last_exported_by: row.last_exported_by,
      last_export_filename: row.last_export_filename,
      workflow_mode: row.workflow_mode,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    items.map(rowToItem)
  )
}

function documentToRow(doc, extras = {}) {
  const row = {
    purchase_order_id: doc.purchaseOrderId ?? doc.purchase_order_id ?? null,
    supplier_id: doc.supplierId ?? doc.supplier_id ?? null,
    supplier_name: (doc.supplierName ?? doc.supplier_name ?? '').trim(),
    status: doc.status ?? RECEIVING_STATUS.AWAITING_RECEIVING,
    expected_delivery_date: doc.expectedDeliveryDate ?? doc.expected_delivery_date ?? null,
    created_by: doc.createdBy ?? doc.created_by ?? null,
    created_by_name: doc.createdByName ?? doc.created_by_name ?? null,
    received_by: doc.receivedBy ?? doc.received_by ?? null,
    received_by_name: doc.receivedByName ?? doc.received_by_name ?? null,
    supplier_invoice_numbers:
      doc.supplierInvoiceNumbers ?? doc.supplier_invoice_numbers ?? [],
    comment: (doc.comment ?? '').trim(),
    total_ordered_qty: doc.totalOrderedQty ?? doc.total_ordered_qty ?? 0,
    total_received_qty: doc.totalReceivedQty ?? doc.total_received_qty ?? 0,
    total_difference_qty: doc.totalDifferenceQty ?? doc.total_difference_qty ?? 0,
    total_amount: doc.totalAmount ?? doc.total_amount ?? 0,
    total_received_amount:
      doc.totalReceivedAmount ?? doc.total_received_amount ?? 0,
    workflow_mode: doc.workflowMode ?? PROCUREMENT_WORKFLOW_MODE.ANALYTICS,
  }

  if (extras.id) row.id = extras.id
  if (extras.created_at) row.created_at = extras.created_at
  if (extras.updated_at) row.updated_at = extras.updated_at

  return row
}

async function fetchDocumentById(documentId, { attachPhotoUrls = true } = {}) {
  ensureClient()

  const docResult = await supabase
    .from('receiving_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle()

  const docRow = await throwIfError(docResult, 'Загрузка документа приёмки')
  if (!docRow) return null

  const itemsResult = await supabase
    .from('receiving_items')
    .select('*')
    .eq('receiving_document_id', documentId)
    .order('created_at', { ascending: true })

  const items = await throwIfError(itemsResult, 'Загрузка позиций приёмки')
  const normalizedItems = (items || []).map(rowToItem)
  const paths = [...new Set(normalizedItems.flatMap((item) => item.photoPaths || []).filter(Boolean))]
  let signedUrlsByPath = new Map()

  if (attachPhotoUrls && paths.length > 0) {
    const signedResult = await supabase.storage
      .from(RECEIVING_PHOTO_BUCKET)
      .createSignedUrls(paths, RECEIVING_PHOTO_SIGNED_URL_TTL_SECONDS)
    const signedRows = await throwIfError(signedResult, 'Загрузка фотографий расхождений')
    signedUrlsByPath = new Map(
      (signedRows || [])
        .filter((row) => row?.path && row?.signedUrl)
        .map((row) => [row.path, row.signedUrl])
    )
  }

  const document = rowToDocument(docRow, items || [])
  return {
    ...document,
    items: document.items.map((item) => ({
      ...item,
      photoUrls: (item.photoPaths || []).map((path) => signedUrlsByPath.get(path)).filter(Boolean),
    })),
  }
}

export async function fetchReceivingDataCloud() {
  ensureClient()

  const docsResult = await supabase
    .from('receiving_documents')
    .select('*')
    .order('created_at', { ascending: false })

  const documents = await throwIfError(docsResult, 'Загрузка документов приёмки')
  if (!documents?.length) {
    return { documents: [] }
  }

  const docIds = documents.map((row) => row.id)
  const items = await fetchAllRowsByIdChunks({
    ids: docIds,
    idChunkSize: DEFAULT_IN_FILTER_CHUNK_SIZE,
    pageSize: DEFAULT_POSTGREST_PAGE_SIZE,
    overflowMessage: 'Не удалось загрузить позиции приёмки.',
    fetchPage: ({ idChunk, from, to }) =>
      supabase
        .from('receiving_items')
        .select('*')
        .in('receiving_document_id', idChunk)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    onPageResult: (result) =>
      throwIfError(result, 'Загрузка позиций приёмки', 'Не удалось загрузить позиции приёмки.'),
  })

  const itemsByDoc = new Map()
  for (const row of items) {
    if (!itemsByDoc.has(row.receiving_document_id)) {
      itemsByDoc.set(row.receiving_document_id, [])
    }
    itemsByDoc.get(row.receiving_document_id).push(row)
  }

  return {
    documents: documents.map((row) =>
      rowToDocument(row, itemsByDoc.get(row.id) || [])
    ),
  }
}

export async function transferFromPurchaseCloud(orderId, user) {
  ensureClient()

  const order = await fetchOrderById(orderId)
  if (!order) throw new Error('Закуп не найден')

  if (order.transferredToReceiving || order.receivingDocumentId) {
    throw new Error('Этот закуп уже передан в приёмку.')
  }

  const items = order.items || []
  const totals = calcReceivingTotals(
    items.map((item) =>
      normalizeReceivingItem({
        orderedQty: item.orderQty,
        receivedQty: 0,
      })
    )
  )
  const now = new Date().toISOString()
  const docId = crypto.randomUUID()

  const docRow = documentToRow(
    {
      purchaseOrderId: order.id,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      status: RECEIVING_STATUS.AWAITING_RECEIVING,
      expectedDeliveryDate: order.expectedDeliveryDate,
      createdBy: user?.login || user?.id || '',
      createdByName: user?.name || '',
      receivedBy: null,
      receivedByName: null,
      comment: order.comment,
      totalOrderedQty: totals.totalOrderedQty,
      totalReceivedQty: 0,
      totalDifferenceQty: 0 - totals.totalOrderedQty,
    },
    { id: docId, created_at: now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('receiving_documents').insert(docRow),
    'Создание документа приёмки'
  )

  if (items.length > 0) {
    const itemRows = items.map((item, index) =>
      itemToRow(
        normalizeReceivingItem({
          purchaseOrderItemId: item.id,
          productName: item.productName,
          barcode: item.barcode,
          unit: item.unit,
          orderedQty: item.orderQty,
          receivedQty: 0,
          differenceQty: calcDifferenceQty(0, item.orderQty),
          purchasePrice: item.purchasePrice,
          actualPurchasePrice: item.purchasePrice,
          status: RECEIVING_ITEM_STATUS.PENDING,
          comment: item.comment,
          created_at: now,
        }),
        docId
      )
    )

    await throwIfError(
      await supabase.from('receiving_items').insert(itemRows),
      'Создание позиций приёмки'
    )
  }

  await throwIfError(
    await supabase
      .from('purchase_orders')
      .update({
        status: PURCHASE_STATUS.AWAITING_RECEIVING,
        transferred_to_receiving: true,
        receiving_document_id: docId,
        updated_at: now,
      })
      .eq('id', orderId),
    'Обновление закупа после передачи в приёмку'
  )

  return { receivingDocumentId: docId }
}

async function syncReceivingItems(documentId, items) {
  ensureClient()

  const normalized = (items || []).map(normalizeReceivingItem)
  const incomingIds = new Set(normalized.map((item) => item.id).filter(Boolean))

  const existingResult = await supabase
    .from('receiving_items')
    .select('id')
    .eq('receiving_document_id', documentId)

  const existing = await throwIfError(existingResult, 'Загрузка позиций для синхронизации')
  const toDelete = (existing || [])
    .filter((row) => !incomingIds.has(row.id))
    .map((row) => row.id)

  if (toDelete.length > 0) {
    await throwIfError(
      await supabase.from('receiving_items').delete().in('id', toDelete),
      'Удаление позиций приёмки'
    )
  }

  if (normalized.length > 0) {
    const rows = normalized.map((item) => itemToRow(item, documentId))
    await throwIfError(
      await supabase.from('receiving_items').upsert(rows),
      'Сохранение позиций приёмки'
    )
  }
}

function itemToRpcPayload(item) {
  const normalized = normalizeReceivingItem(item)
  return {
    id: normalized.id || null,
    received_qty: normalized.receivedQty,
    actual_purchase_price: normalized.actualPurchasePrice,
    barcode: normalized.barcode,
    discrepancy_reason_code: normalized.discrepancyReasonCode,
    discrepancy_reason: normalized.discrepancyReason,
    comment: normalized.comment,
    photo_urls: normalizeReceivingPhotoStoragePaths(normalized.photoPaths),
    photo_metadata: normalized.photoMetadata,
    sort_order: normalized.sortOrder,
  }
}

export async function uploadReceivingItemPhotosCloud(documentId, items) {
  ensureClient()
  const uploadedPaths = []

  try {
    const result = []
    for (const item of items || []) {
      const pendingFiles = Array.from(item.pendingPhotoFiles || [])
      if (pendingFiles.length === 0) {
        result.push(item)
        continue
      }

      const itemId = item.id || crypto.randomUUID()
      const existingPaths = normalizeReceivingPhotoStoragePaths(
        item.photoPaths ?? item.photo_paths ?? []
      )
      const existingMetadata = item.photoMetadata ?? item.photo_metadata ?? []
      const nextPaths = [...existingPaths]
      const nextMetadata = [...existingMetadata]

      for (const file of pendingFiles) {
        const { extension, contentType, size } = validateReceivingPhotoFile(file)
        const path = buildReceivingPhotoPath(documentId, itemId, extension)
        const uploadResult = await supabase.storage
          .from(RECEIVING_PHOTO_BUCKET)
          .upload(path, file, { contentType, upsert: false })
        await throwIfError(uploadResult, `Загрузка фото «${file.name || 'без имени'}»`)
        uploadedPaths.push(path)
        nextPaths.push(path)
        nextMetadata.push({
          path,
          fileName: file.name || null,
          contentType,
          size,
          uploadedAt: new Date().toISOString(),
        })
      }

      result.push({
        ...item,
        id: itemId,
        photoPaths: nextPaths,
        photoUrls: nextPaths,
        photoMetadata: nextMetadata,
        pendingPhotoFiles: [],
      })
    }
    return result
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(RECEIVING_PHOTO_BUCKET).remove(uploadedPaths).catch(() => {})
    }
    throw error
  }
}

async function mutateReceivingViaRpc({
  rpcName,
  documentId,
  items,
  current,
  options = {},
}) {
  const expectedVersion = options.expectedVersion ?? current.version ?? null
  const invoiceNumbers =
    options.invoiceNumbers ??
    options.supplierInvoiceNumbers ??
    options.supplier_invoice_numbers ??
    current.supplierInvoiceNumbers ??
    []
  await throwIfError(
    await supabase.rpc(rpcName, {
      p_document_id: documentId,
      p_expected_version: expectedVersion,
      p_invoice_numbers: invoiceNumbers,
      p_items: (items || []).map(itemToRpcPayload),
    }),
    rpcName === 'receiving_complete_v1' ? 'Завершение документа приёмки' : 'Сохранение документа приёмки'
  )
  return fetchDocumentById(documentId)
}

export async function startReceivingDocumentCloud(documentId, { expectedVersion = null } = {}) {
  ensureClient()
  await throwIfError(
    await supabase.rpc('receiving_start_v1', {
      p_document_id: documentId,
      p_expected_version: expectedVersion,
    }),
    'Начало приёмки'
  )
  return fetchDocumentById(documentId)
}

export async function saveReceivingDocumentCloud(documentId, items, user, options = {}) {
  ensureClient()
  void user

  const current = await fetchDocumentById(documentId, { attachPhotoUrls: false })
  if (!current) throw new Error('Документ приёмки не найден')
  return mutateReceivingViaRpc({
    rpcName: 'receiving_save_v1',
    documentId,
    items,
    current,
    options,
  })
}

export async function completeReceivingDocumentCloud(documentId, items, user, options = {}) {
  ensureClient()
  void user

  const current = await fetchDocumentById(documentId, { attachPhotoUrls: false })
  if (!current) throw new Error('Документ приёмки не найден')
  return mutateReceivingViaRpc({
    rpcName: 'receiving_complete_v1',
    documentId,
    items,
    current,
    options,
  })
}

export async function recordReceivingUmagExportCloud(documentId, metadata = {}) {
  ensureClient()
  const current = await fetchDocumentById(documentId, { attachPhotoUrls: false })
  if (!current) throw new Error('Документ приёмки не найден')

  return throwIfError(
    await supabase.rpc('receiving_record_umag_export_v1', {
      p_document_id: documentId,
      p_expected_version: metadata.expectedVersion ?? current.version,
      p_expected_export_version: metadata.expectedExportVersion ?? current.exportVersion,
      p_file_name: metadata.fileName,
      p_row_count: metadata.rowCount ?? 0,
      p_total_quantity: metadata.totalQuantity ?? 0,
      p_total_amount: metadata.totalAmount ?? 0,
      p_umag_comment: metadata.umagComment ?? '',
    }),
    'Сохранение истории выгрузки UMAG'
  )
}

export async function syncSimpleReceivingDocumentCloud(document, order) {
  ensureClient()
  if (!document?.id) return null

  const existingResult = await supabase
    .from('receiving_documents')
    .select('id')
    .eq('id', document.id)
    .maybeSingle()

  await throwIfError(existingResult, 'Проверка документа приёмки')
  if (existingResult.data?.id) {
    return existingResult.data.id
  }

  const now = new Date().toISOString()
  const docRow = documentToRow(
    {
      purchaseOrderId: order?.id ?? document.purchaseOrderId,
      supplierId: document.supplierId ?? order?.supplierId,
      supplierName: document.supplierName ?? order?.supplierName,
      status: RECEIVING_STATUS.AWAITING_RECEIVING,
      expectedDeliveryDate: document.expectedDeliveryDate ?? order?.expectedDeliveryDate,
      createdBy: document.createdBy ?? order?.createdBy ?? '',
      createdByName: document.createdByName ?? order?.createdByName ?? '',
      receivedBy: null,
      receivedByName: null,
      comment: document.comment ?? order?.comment ?? '',
      totalAmount: document.totalAmount ?? order?.totalAmount ?? 0,
      totalOrderedQty: 0,
      totalReceivedQty: 0,
      totalDifferenceQty: 0,
      workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    },
    { id: document.id, created_at: document.createdAt || now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('receiving_documents').insert(docRow),
    'Создание документа приёмки'
  )

  if (order?.id) {
    await throwIfError(
      await supabase
        .from('purchase_orders')
        .update({
          status: PURCHASE_STATUS.AWAITING_RECEIVING,
          transferred_to_receiving: true,
          receiving_document_id: document.id,
          updated_at: now,
        })
        .eq('id', order.id),
      'Привязка документа приёмки'
    )
  }

  return document.id
}

export async function createSimpleReceivingFromPurchaseCloud(order, user) {
  ensureClient()

  if (order.receivingDocumentId) {
    const existing = await fetchDocumentById(order.receivingDocumentId)
    if (existing) {
      return { receivingDocumentId: order.receivingDocumentId }
    }
  }

  const now = new Date().toISOString()
  const docId = crypto.randomUUID()
  const totalAmount = Number(order.totalAmount ?? 0)

  const docRow = documentToRow(
    {
      purchaseOrderId: order.id,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      status: RECEIVING_STATUS.AWAITING_RECEIVING,
      expectedDeliveryDate: order.expectedDeliveryDate,
      createdBy: user?.login || user?.id || order.createdBy || '',
      createdByName: user?.name || order.createdByName || '',
      receivedBy: null,
      receivedByName: null,
      comment: order.comment,
      totalAmount,
      totalOrderedQty: 0,
      totalReceivedQty: 0,
      totalDifferenceQty: 0,
      workflowMode: PROCUREMENT_WORKFLOW_MODE.SIMPLE,
    },
    { id: docId, created_at: now, updated_at: now }
  )

  await throwIfError(
    await supabase.from('receiving_documents').insert(docRow),
    'Создание документа приёмки'
  )

  await throwIfError(
    await supabase
      .from('purchase_orders')
      .update({
        status: PURCHASE_STATUS.AWAITING_RECEIVING,
        transferred_to_receiving: true,
        receiving_document_id: docId,
        updated_at: now,
      })
      .eq('id', order.id),
    'Обновление закупа после передачи в приёмку'
  )

  return { receivingDocumentId: docId }
}

export async function syncSimpleReceivingFromPurchaseCloud(order) {
  ensureClient()
  const docId = order.receivingDocumentId
  if (!docId) return

  await throwIfError(
    await supabase
      .from('receiving_documents')
      .update({
        supplier_id: order.supplierId ?? null,
        supplier_name: (order.supplierName ?? '').trim(),
        expected_delivery_date: order.expectedDeliveryDate || null,
        comment: (order.comment ?? '').trim(),
        total_amount: order.totalAmount ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId),
    'Синхронизация документа приёмки'
  )
}

/**
 * Тронул ли склад приёмку по этому закупу.
 * Приёмка считается начатой, если документ вышел из «Ожидает приёмки»
 * или в него уже что-то принято.
 */
export async function fetchReceivingLockStateByPurchaseIdCloud(purchaseOrderId) {
  ensureClient()

  const result = await supabase
    .from('receiving_documents')
    .select('id, status, total_received_qty')
    .eq('purchase_order_id', purchaseOrderId)

  const rows = await throwIfError(result, 'Проверка документов приёмки')
  const active = (rows || []).filter((row) => row.status !== RECEIVING_STATUS.CANCELLED)

  return {
    documentIds: active.map((row) => row.id),
    receivingStarted: active.some(isReceivingStarted),
  }
}

/** Мягкая отмена документов приёмки по закупу: данные остаются, склад их больше не ждёт */
export async function cancelReceivingByPurchaseIdCloud(purchaseOrderId) {
  ensureClient()
  const order = await fetchPurchaseWorkflow(purchaseOrderId)
  if (order) refuseAnalyticsDirectWrite(order)

  const result = await supabase
    .from('receiving_documents')
    .select('id, workflow_mode')
    .eq('purchase_order_id', purchaseOrderId)
    .neq('status', RECEIVING_STATUS.CANCELLED)

  const rows = await throwIfError(result, 'Поиск документов приёмки')
  const docIds = []
  for (const row of rows || []) {
    refuseAnalyticsDirectWrite(row)
    docIds.push(row.id)
  }
  if (docIds.length === 0) return 0

  await throwIfError(
    await supabase
      .from('receiving_documents')
      .update({
        status: RECEIVING_STATUS.CANCELLED,
        updated_at: new Date().toISOString(),
      })
      .in('id', docIds),
    'Отмена документов приёмки'
  )

  return docIds.length
}

export async function deleteReceivingByPurchaseIdCloud(purchaseOrderId) {
  ensureClient()
  const order = await fetchPurchaseWorkflow(purchaseOrderId)
  if (order) refuseAnalyticsDirectWrite(order)

  const docsResult = await supabase
    .from('receiving_documents')
    .select('id, workflow_mode')
    .eq('purchase_order_id', purchaseOrderId)

  const docRows = await throwIfError(docsResult, 'Поиск документов приёмки')
  const docIds = []
  for (const row of docRows || []) {
    refuseAnalyticsDirectWrite(row)
    docIds.push(row.id)
  }
  if (docIds.length === 0) return

  await throwIfError(
    await supabase.from('receiving_items').delete().in('receiving_document_id', docIds),
    'Удаление позиций приёмки'
  )

  await throwIfError(
    await supabase.from('receiving_documents').delete().in('id', docIds),
    'Удаление документов приёмки'
  )
}

export async function acceptSimpleDeliveryCloud(documentId, user) {
  ensureClient()

  const current = await fetchDocumentById(documentId)
  if (!current) throw new Error('Документ приёмки не найден')
  refuseAnalyticsDirectWrite(current)

  const now = new Date().toISOString()

  await throwIfError(
    await supabase
      .from('receiving_documents')
      .update({
        status: RECEIVING_STATUS.RECEIVED,
        received_by: user?.login || user?.id || current.receivedBy || null,
        received_by_name: user?.name || current.receivedByName || null,
        updated_at: now,
      })
      .eq('id', documentId),
    'Принятие поставки'
  )

  if (current.purchaseOrderId) {
    await throwIfError(
      await supabase
        .from('purchase_orders')
        .update({
          status: PURCHASE_STATUS.RECEIVED,
          updated_at: now,
        })
        .eq('id', current.purchaseOrderId),
      'Обновление связанного закупа'
    )
  }

  return fetchDocumentById(documentId)
}

export async function unacceptSimpleDeliveryCloud(documentId) {
  ensureClient()

  const current = await fetchDocumentById(documentId)
  if (!current) throw new Error('Документ приёмки не найден')
  refuseAnalyticsDirectWrite(current)

  const now = new Date().toISOString()

  await throwIfError(
    await supabase
      .from('receiving_documents')
      .update({
        status: RECEIVING_STATUS.AWAITING_RECEIVING,
        received_by: null,
        received_by_name: null,
        updated_at: now,
      })
      .eq('id', documentId),
    'Снятие отметки приёмки'
  )

  if (current.purchaseOrderId) {
    await throwIfError(
      await supabase
        .from('purchase_orders')
        .update({
          status: PURCHASE_STATUS.AWAITING_RECEIVING,
          updated_at: now,
        })
        .eq('id', current.purchaseOrderId),
      'Обновление связанного закупа'
    )
  }

  return fetchDocumentById(documentId)
}

export { fetchDocumentById, rowToDocument, rowToItem, itemToRow }
