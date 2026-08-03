import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isCloudMode } from '../lib/dataMode'

export const CANDIDATE_PHOTO_BUCKET = 'candidate-photos'
export const MAX_CANDIDATE_PHOTO_BYTES = 5 * 1024 * 1024
export const ALLOWED_CANDIDATE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Short-lived display URLs for HR UI; never persist to DB. */
export const CANDIDATE_PHOTO_SIGNED_URL_TTL_SEC = 3600

const PUBLIC_PATH_MARKER = `/storage/v1/object/public/${CANDIDATE_PHOTO_BUCKET}/`
const SIGNED_PATH_MARKER = `/storage/v1/object/sign/${CANDIDATE_PHOTO_BUCKET}/`
const NEW_PHOTO_PATH_RE =
  /^applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$/i

export function validateCandidatePhotoFile(file) {
  if (!file) return null
  if (!ALLOWED_CANDIDATE_PHOTO_TYPES.includes(file.type)) {
    return 'Можно загрузить только JPEG, PNG или WebP'
  }
  if (file.size > MAX_CANDIDATE_PHOTO_BYTES) {
    return 'Фото должно быть не больше 5 MB'
  }
  return null
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/** Build unpredictable private storage path for a new candidate photo. */
export function buildCandidatePhotoPath(file) {
  const ext = extensionForMime(file?.type)
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `applications/${id}.${ext}`
}

export function extractCandidatePhotoPathFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  for (const marker of [PUBLIC_PATH_MARKER, SIGNED_PATH_MARKER]) {
    const idx = url.indexOf(marker)
    if (idx === -1) continue
    const rest = url.slice(idx + marker.length)
    const path = decodeURIComponent(rest.split('?')[0] || '')
    return path || null
  }
  return null
}

export function resolveCandidatePhotoStoragePath(candidate) {
  if (!candidate) return null
  const direct = candidate.photoPath || candidate.photo_path || null
  if (direct && String(direct).trim()) return String(direct).trim()
  return extractCandidatePhotoPathFromUrl(candidate.photoUrl || candidate.photo_url || null)
}

export async function createCandidatePhotoSignedUrl(
  storagePath,
  expiresIn = CANDIDATE_PHOTO_SIGNED_URL_TTL_SEC
) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase Storage не настроен')
  }
  if (!storagePath) throw new Error('Файл не найден')

  const { data, error } = await supabase.storage
    .from(CANDIDATE_PHOTO_BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Не удалось открыть фото')
  }
  return data.signedUrl
}

/** Attach ephemeral signed photoUrl for HR display. Does not mutate DB rows. */
export async function attachCandidatePhotoSignedUrls(candidates, expiresIn = CANDIDATE_PHOTO_SIGNED_URL_TTL_SEC) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) return candidates

  const paths = [
    ...new Set(
      candidates
        .map((c) => resolveCandidatePhotoStoragePath(c))
        .filter(Boolean)
    ),
  ]
  if (!paths.length) {
    return candidates.map((c) => ({
      ...c,
      photoUrl: c.photoUrl?.startsWith('data:') ? c.photoUrl : null,
    }))
  }

  const { data, error } = await supabase.storage
    .from(CANDIDATE_PHOTO_BUCKET)
    .createSignedUrls(paths, expiresIn)

  if (error || !Array.isArray(data)) {
    return candidates.map((c) => ({
      ...c,
      photoUrl: c.photoUrl?.startsWith('data:') ? c.photoUrl : null,
    }))
  }

  const byPath = new Map()
  data.forEach((row, index) => {
    const signed = row?.signedUrl || row?.signedURL
    const path = row?.path || paths[index]
    if (path && signed && !row?.error) {
      byPath.set(path, signed)
    }
  })

  return candidates.map((c) => {
    const path = resolveCandidatePhotoStoragePath(c)
    if (path && byPath.has(path)) {
      return { ...c, photoPath: path, photoUrl: byPath.get(path) }
    }
    if (c.photoUrl?.startsWith('data:')) return c
    return { ...c, photoPath: path, photoUrl: null }
  })
}

export async function uploadCandidatePhoto(file) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase Storage не настроен')
  }

  const validationError = validateCandidatePhotoFile(file)
  if (validationError) throw new Error(validationError)

  const path = buildCandidatePhotoPath(file)
  if (!NEW_PHOTO_PATH_RE.test(path)) {
    throw new Error('Не удалось подготовить путь для фото')
  }

  const { error } = await supabase.storage.from(CANDIDATE_PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })

  if (error) {
    throw new Error('Не удалось загрузить фото. Попробуйте другой файл.')
  }

  // Private bucket: never store/return a permanent public URL.
  return {
    photoUrl: null,
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

export async function prepareCandidatePhotoForSubmit(file) {
  if (!file) return { photoUrl: null, photoPath: null }

  if (isCloudMode() && isSupabaseConfigured()) {
    return uploadCandidatePhoto(file)
  }

  const dataUrl = await readPhotoAsDataUrl(file)
  return { photoUrl: dataUrl, photoPath: null, isLocalFallback: true }
}

/**
 * Copy candidate photo into employee-avatars after hire.
 * Returns permanent employee avatar URL; does not write employee row.
 */
export async function transferCandidatePhotoToEmployee(candidate, employeeId) {
  if (!isCloudMode() || !isSupabaseConfigured() || !supabase) return null
  const path = resolveCandidatePhotoStoragePath(candidate)
  if (!path || !employeeId) return null

  const { data: blob, error: downloadError } = await supabase.storage
    .from(CANDIDATE_PHOTO_BUCKET)
    .download(path)

  if (downloadError || !blob) {
    console.warn('Не удалось скопировать фото кандидата:', downloadError?.message)
    return null
  }

  const { uploadEmployeeAvatarFile } = await import('./employeeAvatarService')
  const file = new File([blob], 'candidate-photo.jpg', {
    type: blob.type || 'image/jpeg',
  })
  const uploaded = await uploadEmployeeAvatarFile(employeeId, file)
  return uploaded?.avatarUrl || null
}

export function getCandidateInitials(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}
