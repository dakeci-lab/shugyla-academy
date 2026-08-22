import { supabase } from '../lib/supabaseClient'

const TABLE = 'user_table_settings'

export const TABLE_SETTINGS_MIGRATION_MESSAGE =
  'Настройки таблиц ещё не подключены к базе данных. Необходимо применить миграцию user_table_settings.'

function isMissingTableError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  return (
    error.code === 'PGRST205' ||
    msg.includes('user_table_settings') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table')
  )
}

function toUserError(error, fallback) {
  if (isMissingTableError(error)) return new Error(TABLE_SETTINGS_MIGRATION_MESSAGE)
  return new Error(error.message || fallback)
}

function mapRow(row) {
  if (!row) return null
  return {
    tableName: row.table_name,
    pageSize: row.page_size,
    columns: Array.isArray(row.columns) ? row.columns : [],
  }
}

/**
 * @param {string} tableName
 * @returns {Promise<object|null>}
 */
export async function getTableSettings(tableName) {
  if (!supabase) return null

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData?.session?.access_token) return null

  const result = await supabase
    .from(TABLE)
    .select('table_name, page_size, columns')
    .eq('table_name', tableName)
    .maybeSingle()

  if (result.error) {
    if (isMissingTableError(result.error)) return null
    throw toUserError(result.error, 'Не удалось загрузить настройки таблицы')
  }

  return mapRow(result.data)
}

/**
 * @param {{ tableName: string, pageSize: number, columns: object[] }} payload
 * @returns {Promise<object>}
 */
export async function saveTableSettings(payload) {
  if (!supabase) {
    throw new Error('Supabase не настроен')
  }
  if (!payload?.tableName) {
    throw new Error('tableName is required')
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw toUserError(userError, 'Не удалось определить пользователя')
  const userId = userData?.user?.id
  if (!userId) throw new Error('Требуется авторизация')

  const row = {
    auth_user_id: userId,
    table_name: payload.tableName,
    page_size: payload.pageSize,
    columns: payload.columns,
  }

  const result = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'auth_user_id,table_name' })
    .select('table_name, page_size, columns')
    .single()

  if (result.error) {
    throw toUserError(result.error, 'Не удалось сохранить настройки таблицы')
  }

  return mapRow(result.data)
}
