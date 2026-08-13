export const RECEIVING_PHOTO_BUCKET = 'receiving-discrepancy-photos'
export const RECEIVING_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const RECEIVING_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60

const UUID_PATH_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const RECEIVING_PHOTO_STORAGE_PATH_PATTERN = new RegExp(
  `^documents/${UUID_PATH_PART}/${UUID_PATH_PART}/${UUID_PATH_PART}\\.(?:jpe?g|png|webp|heic)$`,
  'i'
)

export function isReceivingPhotoStoragePath(value) {
  return RECEIVING_PHOTO_STORAGE_PATH_PATTERN.test(String(value || '').trim())
}

export function normalizeReceivingPhotoStoragePaths(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((path) => String(path || '').trim()).filter(isReceivingPhotoStoragePath))]
}

const MIME_BY_EXTENSION = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
})

const EXTENSION_BY_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fileExtension(name) {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

export function validateReceivingPhotoFile(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('Выберите файл изображения.')
  }

  const size = Number(file.size || 0)
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`Фото «${file.name || 'без имени'}» пустое.`)
  }
  if (size > RECEIVING_PHOTO_MAX_BYTES) {
    throw new Error(`Фото «${file.name || 'без имени'}» превышает 10 МБ.`)
  }

  const sourceExtension = fileExtension(file.name)
  const sourceMime = String(file.type || '').trim().toLowerCase()
  const extension = EXTENSION_BY_MIME[sourceMime] ?? (
    MIME_BY_EXTENSION[sourceExtension] ? sourceExtension : ''
  )
  const contentType = MIME_BY_EXTENSION[extension]

  if (!extension || !contentType || (sourceMime && !EXTENSION_BY_MIME[sourceMime])) {
    throw new Error('Допустимы только JPEG, PNG, WebP и HEIC.')
  }

  return { extension, contentType, size }
}

export function buildReceivingPhotoPath(documentId, itemId, extension) {
  if (!UUID_PATTERN.test(String(documentId || ''))) {
    throw new Error('Некорректный идентификатор документа приёмки.')
  }
  if (!UUID_PATTERN.test(String(itemId || ''))) {
    throw new Error('Некорректный идентификатор позиции приёмки.')
  }

  const uuid = globalThis.crypto?.randomUUID?.()
  if (!uuid) throw new Error('Браузер не поддерживает безопасное создание имени фото.')
  return `documents/${documentId}/${itemId}/${uuid}.${extension}`
}

export function readReceivingPhotoAsDataUrl(file) {
  validateReceivingPhotoFile(file)
  if (typeof FileReader === 'undefined') {
    return Promise.reject(new Error('Браузер не поддерживает чтение фото.'))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Не удалось прочитать фото «${file.name || 'без имени'}».`))
    reader.readAsDataURL(file)
  })
}
