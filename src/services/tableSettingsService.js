import { isCloudMode } from '../lib/dataMode'
import * as localAdapter from './tableSettingsLocalAdapter'
import * as supabaseAdapter from './tableSettingsSupabaseAdapter'

function getAdapter() {
  return isCloudMode() ? supabaseAdapter : localAdapter
}

/**
 * @param {string} tableName
 * @returns {Promise<object|null>}
 */
export async function getTableSettings(tableName) {
  return getAdapter().getTableSettings(tableName)
}

/**
 * @param {{ tableName: string, pageSize: number, columns: object[] }} payload
 * @returns {Promise<object>}
 */
export async function saveTableSettings(payload) {
  return getAdapter().saveTableSettings(payload)
}

export { PROCUREMENT_PLANNER_TABLE_NAME } from '../utils/procurementPlannerColumnRegistry'
