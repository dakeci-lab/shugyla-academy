import { isSupabaseConfigured } from './supabaseClient'

/** Cloud mode when Supabase env variables are present */
export function isCloudMode() {
  return isSupabaseConfigured()
}

export function getDataModeLabel() {
  return isCloudMode() ? 'Облачный режим' : 'Локальный режим'
}

export function getDataModeVariant() {
  return isCloudMode() ? 'cloud' : 'local'
}
