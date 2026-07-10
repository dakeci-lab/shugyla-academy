import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { readPhotoAsDataUrl } from './candidatePhotoService'
import {
  normalizeAvatarImage,
  isAllowedAvatarInputFile,
  AVATAR_OUTPUT_MIME,
} from '../utils/normalizeAvatarImage'

export const EMPLOYEE_AVATAR_BUCKET = 'employee-avatars'
export const MAX_EMPLOYEE_AVATAR_BYTES = 5 * 1024 * 1024

/** @deprecated Используйте isAllowedAvatarInputFile */
export const ALLOWED_EMPLOYEE_AVATAR_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

export function validateEmployeeAvatarFile(file) {
  if (!file) return null
  if (!isAllowedAvatarInputFile(file)) {
    return 'Не удалось загрузить изображение'
  }
  if (file.size > MAX_EMPLOYEE_AVATAR_BYTES) {
    return 'Размер файла не должен превышать 5 МБ'
  }
  return null
}

export function buildEmployeeAvatarPath(employeeId) {
  return `${employeeId}/avatar-${Date.now()}.jpg`
}

export function extractEmployeeAvatarPath(avatarUrl) {
  if (!avatarUrl) return null
  const marker = `/storage/v1/object/public/${EMPLOYEE_AVATAR_BUCKET}/`
  const idx = avatarUrl.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(avatarUrl.slice(idx + marker.length))
}

export async function uploadEmployeeAvatarFile(employeeId, file) {
  const validationError = validateEmployeeAvatarFile(file)
  if (validationError) throw new Error(validationError)

  const normalizedFile = await normalizeAvatarImage(file)

  if (normalizedFile.size > MAX_EMPLOYEE_AVATAR_BYTES) {
    throw new Error('Размер файла не должен превышать 5 МБ')
  }

  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    const dataUrl = await readPhotoAsDataUrl(normalizedFile)
    return { avatarUrl: dataUrl, avatarPath: null }
  }

  const path = buildEmployeeAvatarPath(employeeId)
  const { error } = await supabase.storage
    .from(EMPLOYEE_AVATAR_BUCKET)
    .upload(path, normalizedFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: AVATAR_OUTPUT_MIME,
    })

  if (error) {
    throw new Error('Не удалось загрузить изображение')
  }

  const { data } = supabase.storage.from(EMPLOYEE_AVATAR_BUCKET).getPublicUrl(path)
  return { avatarUrl: data.publicUrl, avatarPath: path }
}

export async function deleteEmployeeAvatarFile(avatarUrl) {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) return
  const path = extractEmployeeAvatarPath(avatarUrl)
  if (!path) return

  const { error } = await supabase.storage.from(EMPLOYEE_AVATAR_BUCKET).remove([path])
  if (error) {
    console.warn('Не удалось удалить старый файл аватарки:', error.message)
  }
}
