import {
  normalizePurchaseOrder,
  normalizePurchaseItem,
  PURCHASE_STATUS,
  calcOrderTotal,
} from '../utils/purchaseData'

const ORDERS_KEY = 'shugyla_purchase_orders'
const COUNTER_KEY = 'shugyla_purchase_counter'

function readOrders() {
  const data = localStorage.getItem(ORDERS_KEY)
  return data ? JSON.parse(data) : []
}

function writeOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
}

function genId() {
  return crypto.randomUUID()
}

function nextNumber() {
  const year = new Date().getFullYear()
  const counter = Number(localStorage.getItem(COUNTER_KEY) || '0') + 1
  localStorage.setItem(COUNTER_KEY, String(counter))
  return `Z-${year}-${String(counter).padStart(4, '0')}`
}

function seedIfEmpty() {
  if (readOrders().length > 0) return

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  const items1 = [
    {
      id: genId(),
      productName: 'Молоко 3.2% 1л',
      barcode: '4870201234567',
      stock: 24,
      salesPerDay: 8.5,
      recommendation: 40,
      orderQty: 36,
      purchasePrice: 420,
      comment: '',
    },
    {
      id: genId(),
      productName: 'Кефир 1% 900мл',
      barcode: '4870201234568',
      stock: 12,
      salesPerDay: 5.2,
      recommendation: 25,
      orderQty: 22,
      purchasePrice: 380,
      comment: 'Проверить срок годности',
    },
    {
      id: genId(),
      productName: 'Сметана 20% 400г',
      barcode: '4870201234569',
      stock: 8,
      salesPerDay: 3.1,
      recommendation: 18,
      orderQty: 15,
      purchasePrice: 650,
      comment: '',
    },
  ].map((item) => normalizePurchaseItem(item))

  const items2 = [
    {
      id: genId(),
      productName: 'Рис круглый 1кг',
      barcode: '4870202234567',
      stock: 45,
      salesPerDay: 2.1,
      recommendation: 10,
      orderQty: 10,
      purchasePrice: 890,
      comment: '',
    },
    {
      id: genId(),
      productName: 'Гречка 900г',
      barcode: '4870202234568',
      stock: 30,
      salesPerDay: 1.8,
      recommendation: 8,
      orderQty: 8,
      purchasePrice: 720,
      comment: '',
    },
  ].map((item) => normalizePurchaseItem(item))

  writeOrders([
    normalizePurchaseOrder({
      id: genId(),
      number: 'Z-2026-0001',
      date: today,
      supplierId: null,
      supplierName: 'ТОО «МолКом»',
      status: PURCHASE_STATUS.DRAFT,
      createdBy: 'admin',
      createdByName: 'Администратор',
      expectedDeliveryDate: '2026-07-12',
      comment: 'Еженедельный заказ молочки',
      items: items1,
      created_at: now,
      updated_at: now,
    }),
    normalizePurchaseOrder({
      id: genId(),
      number: 'Z-2026-0002',
      date: today,
      supplierId: null,
      supplierName: 'ИП «Bakaleya Plus»',
      status: PURCHASE_STATUS.AWAITING_RECEIVING,
      createdBy: 'admin',
      createdByName: 'Администратор',
      expectedDeliveryDate: '2026-07-11',
      comment: '',
      items: items2,
      created_at: now,
      updated_at: now,
    }),
    normalizePurchaseOrder({
      id: genId(),
      number: 'Z-2026-0003',
      date: '2026-07-05',
      supplierId: null,
      supplierName: 'Прима Nivea',
      status: PURCHASE_STATUS.FORMED,
      createdBy: 'purchaser',
      createdByName: 'Закупщик',
      expectedDeliveryDate: '2026-07-10',
      comment: 'Бакалея — пополнение полки',
      items: [],
      created_at: now,
      updated_at: now,
    }),
  ])
  localStorage.setItem(COUNTER_KEY, '3')
}

export function getLocalPurchasesBundle() {
  seedIfEmpty()
  return { orders: readOrders().map(normalizePurchaseOrder) }
}

export async function fetchPurchasesData() {
  return getLocalPurchasesBundle()
}

export async function createPurchaseOrder(data) {
  seedIfEmpty()
  const orders = readOrders()
  const now = new Date().toISOString()
  const order = normalizePurchaseOrder({
    id: genId(),
    number: nextNumber(),
    date: data.date || now.slice(0, 10),
    supplierId: data.supplierId || null,
    supplierName: data.supplierName?.trim() || '',
    status: PURCHASE_STATUS.DRAFT,
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    expectedDeliveryDate: data.expectedDeliveryDate || '',
    comment: data.comment?.trim() || '',
    items: [],
    created_at: now,
    updated_at: now,
  })
  orders.unshift(order)
  writeOrders(orders)
  return order.id
}

export async function updatePurchaseOrder(orderId, updates) {
  const orders = readOrders()
  const idx = orders.findIndex((o) => o.id === orderId)
  if (idx < 0) throw new Error('Закуп не найден')

  const current = normalizePurchaseOrder(orders[idx])
  const merged = normalizePurchaseOrder({
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  })
  if (updates.items) {
    merged.items = updates.items.map(normalizePurchaseItem)
    merged.totalAmount = calcOrderTotal(merged.items)
    merged.itemsCount = merged.items.length
  }
  orders[idx] = merged
  writeOrders(orders)
  return merged
}

export async function cancelPurchaseOrder(orderId) {
  await updatePurchaseOrder(orderId, { status: PURCHASE_STATUS.CANCELLED })
}

export async function transferPurchaseToReceiving(orderId) {
  const orders = readOrders()
  const order = orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Закуп не найден')
  await updatePurchaseOrder(orderId, { status: PURCHASE_STATUS.AWAITING_RECEIVING })
  // receiving_documents / receiving_items — подключение позже
  return { ok: true }
}

/** Заглушка Supabase-адаптера */
export async function fetchPurchasesDataCloud() {
  return getLocalPurchasesBundle()
}

export async function createPurchaseOrderCloud(data) {
  return createPurchaseOrder(data)
}

export async function updatePurchaseOrderCloud(orderId, updates) {
  return updatePurchaseOrder(orderId, updates)
}

export async function cancelPurchaseOrderCloud(orderId) {
  return cancelPurchaseOrder(orderId)
}

export async function transferPurchaseToReceivingCloud(orderId) {
  return transferPurchaseToReceiving(orderId)
}
