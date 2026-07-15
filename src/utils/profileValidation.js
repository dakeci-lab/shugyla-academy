/** Валидация контактного email профиля */
export function normalizeContactEmail(value) {
  return value.trim().toLowerCase()
}

export function validateContactEmail(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const normalized = normalizeContactEmail(trimmed)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Укажите корректный email'
  }
  return ''
}
