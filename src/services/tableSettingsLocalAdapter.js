const STORAGE_PREFIX = 'shugyla:tableSettings:'

function storageKey(tableName) {
  return `${STORAGE_PREFIX}${tableName}`
}

/**
 * @param {string} tableName
 * @returns {Promise<object|null>}
 */
export async function getTableSettings(tableName) {
  try {
    const raw = localStorage.getItem(storageKey(tableName))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * @param {{ tableName: string, pageSize: number, columns: object[] }} payload
 * @returns {Promise<object>}
 */
export async function saveTableSettings(payload) {
  if (!payload?.tableName) {
    throw new Error('tableName is required')
  }
  localStorage.setItem(storageKey(payload.tableName), JSON.stringify(payload))
  return payload
}

export { STORAGE_PREFIX }
