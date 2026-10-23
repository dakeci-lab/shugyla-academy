// Receiver's «сверено» ticks live only in this browser (nothing goes to the database). One JSON blob keyed by
// order id; entries untouched for 30 days are dropped so the storage never grows.
const STORAGE_KEY = 'shugyla:order-checklist:v1'
export const CHECKLIST_TTL_MS = 30 * 24 * 60 * 60 * 1000

function readAll(storage, now) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const fresh = {}
    for (const [orderId, entry] of Object.entries(parsed)) {
      if (entry && Array.isArray(entry.ids) && now - Number(entry.at) < CHECKLIST_TTL_MS) fresh[orderId] = entry
    }
    return fresh
  } catch {
    return {}
  }
}

function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadOrderChecklist(orderId, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !orderId) return new Set()
  const entry = readAll(storage, now)[String(orderId)]
  return new Set(entry ? entry.ids : [])
}

export function saveOrderChecklist(orderId, ids, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !orderId) return
  try {
    const all = readAll(storage, now)
    const list = [...ids]
    if (list.length) all[String(orderId)] = { at: now, ids: list }
    else delete all[String(orderId)]
    storage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // private mode / quota — ticks just won't be remembered
  }
}
