import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

export const CANDIDATE_PHOTO_BUCKET = 'candidate-photos'
export const MAX_CANDIDATE_PHOTO_BYTES = 5 * 1024 * 1024
export const ALLOWED_CANDIDATE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validateCandidatePhotoFile(file) {
  if (!file) return null
  if (!ALLOWED_CANDIDATE_PHOTO_TYPES.includes(file.type)) {
    return 'Можно загрузить только изображение'
  }
  if (file.size > MAX_CANDIDATE_PHOTO_BYTES) {
    return 'Фото должно быть не больше 5 MB'
  }
  return null
}

function safeFileName(name) {
  return (name || 'photo.jpg')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'photo.jpg'
}

export async function uploadCandidatePhoto(file, vacancySlug) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase Storage не настроен')
  }

  const validationError = validateCandidatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  const path = `${vacancySlug}/${Date.now()}-${safeFileName(file.name)}`

  const { error } = await supabase.storage
    .from(CANDIDATE_PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    throw new Error(`Не удалось загрузить фото: ${error.message}`)
  }

  const { data } = supabase.storage.from(CANDIDATE_PHOTO_BUCKET).getPublicUrl(path)

  return {
    photoUrl: data.publicUrl,
    photoPath: path,
  }
}

/** Local fallback: сохранить фото как data URL для превью в админке */
export function readPhotoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

export async function prepareCandidatePhotoForSubmit(file, vacancySlug) {
  if (!file) return { photoUrl: null, photoPath: null }

  if (isCloudMode() && isSupabaseConfigured()) {
    return uploadCandidatePhoto(file, vacancySlug)
  }

  const dataUrl = await readPhotoAsDataUrl(file)
  return { photoUrl: dataUrl, photoPath: null, isLocalFallback: true }
}

export function getCandidateInitials(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}
