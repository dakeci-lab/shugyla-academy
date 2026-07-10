/** Нормализация аватарок: sRGB JPEG, без HDR / Display P3, resize до 1024px */

export const AVATAR_MAX_EDGE_PX = 1024
export const AVATAR_JPEG_QUALITY = 0.88
export const AVATAR_OUTPUT_MIME = 'image/jpeg'

export const ALLOWED_AVATAR_INPUT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

const ALLOWED_AVATAR_INPUT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']

export function isAllowedAvatarInputFile(file) {
  if (!file) return false
  if (file.type && ALLOWED_AVATAR_INPUT_TYPES.includes(file.type)) return true
  const ext = file.name?.split('.').pop()?.toLowerCase()
  return ALLOWED_AVATAR_INPUT_EXTENSIONS.includes(ext)
}

function scaleToMaxEdge(width, height, maxEdge) {
  const longSide = Math.max(width, height)
  if (!longSide || longSide <= maxEdge) {
    return { width: width || maxEdge, height: height || maxEdge }
  }
  const ratio = maxEdge / longSide
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

async function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    if (typeof image.decode === 'function') {
      await image.decode()
    } else {
      await new Promise((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Не удалось прочитать изображение'))
      })
    }
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Не удалось обработать изображение'))
      },
      type,
      quality
    )
  })
}

/**
 * Рисует файл на Canvas и экспортирует sRGB JPEG (без HDR / wide gamut метаданных).
 * @returns {Promise<Blob>}
 */
export async function renderNormalizedAvatarBlob(file) {
  const image = await loadImageElement(file)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Не удалось прочитать изображение')
  }

  const { width, height } = scaleToMaxEdge(sourceWidth, sourceHeight, AVATAR_MAX_EDGE_PX)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  let ctx = null
  try {
    ctx = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' })
  } catch {
    ctx = canvas.getContext('2d', { alpha: false })
  }
  if (!ctx) {
    ctx = canvas.getContext('2d')
  }
  if (!ctx) {
    throw new Error('Не удалось обработать изображение')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)

  return canvasToBlob(canvas, AVATAR_OUTPUT_MIME, AVATAR_JPEG_QUALITY)
}

/**
 * @returns {Promise<File>} JPEG-файл для загрузки в Storage
 */
export async function normalizeAvatarImage(file) {
  const blob = await renderNormalizedAvatarBlob(file)
  const baseName = (file.name || 'avatar').replace(/\.[^.]+$/i, '') || 'avatar'
  return new File([blob], `${baseName}.jpg`, {
    type: AVATAR_OUTPUT_MIME,
    lastModified: Date.now(),
  })
}
