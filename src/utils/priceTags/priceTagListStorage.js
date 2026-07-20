/**
 * Local persistence for the price-tag print list (WEB prototype).
 * Compatible with future cloud/import: same document shape via normalizePriceTagList.
 */

import { createEmptyPriceTagList, normalizePriceTagList } from './priceTagModel'

const STORAGE_KEY = 'shugyla_price_tag_list_v2'
const LEGACY_DRAFT_KEY = 'shugyla_price_tag_draft_v1'

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

export function loadPriceTagList() {
  if (!canUseStorage()) return createEmptyPriceTagList()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return normalizePriceTagList(JSON.parse(raw))
    }

    // One-time migrate from single-draft key if present.
    const legacy = window.localStorage.getItem(LEGACY_DRAFT_KEY)
    if (legacy) {
      const migrated = normalizePriceTagList(JSON.parse(legacy))
      savePriceTagList(migrated)
      window.localStorage.removeItem(LEGACY_DRAFT_KEY)
      return migrated
    }
  } catch {
    // ignore corrupt storage
  }

  return createEmptyPriceTagList()
}

export function savePriceTagList(list) {
  if (!canUseStorage()) return false
  try {
    const normalized = normalizePriceTagList({
      ...list,
      updatedAt: new Date().toISOString(),
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return true
  } catch {
    return false
  }
}

export function clearPriceTagListStorage() {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_DRAFT_KEY)
  } catch {
    // ignore
  }
}
