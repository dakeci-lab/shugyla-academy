import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'
import { readPhotoAsDataUrl } from './candidatePhotoService'

export const EMPLOYEE_AVATAR_BUCKET = 'employee-avatars'
export const MAX_EMPLOYEE_AVATAR_BYTES = 5 * 1024 * 1024
export const ALLOWED_EMPLOYEE_AVATAR_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]

export function validateEmployeeAvatarFile(file) {
  if (!file) return null
  if (!ALLOWED_EMPLOYEE_AVATAR_TYPES.includes(file.type)) {
    return 'Не удалось загрузить изображение'
  }
  if (file.size > MAX_EMPLOYEE_AVATAR_BYTES) {
    return 'Размер файла не должен превышать 5 МБ'
  }
  return null
}

function getFileExtension(file) {
  const fromName = file.name?.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) {
    return fromName === 'jpg' ? 'jpeg' : fromName
  }
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpeg'
}

export function buildEmployeeAvatarPath(employeeId, file) {
  const ext = getFileExtension(file)
  return `${employeeId}/avatar-${Date.now()}.${ext}`
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

  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) {
    const dataUrl = await readPhotoAsDataUrl(file)
    return { avatarUrl: dataUrl, avatarPath: null }
  }

  const path = buildEmployeeAvatarPath(employeeId, file)
  const { error } = await supabase.storage
    .from(EMPLOYEE_AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
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
