const TECH_EMAIL_DOMAIN = '@shugyla.local'

/**
 * Нормализует телефон в формат 7XXXXXXXXXX
 * @returns {string|null} null если формат некорректный
 */
export function normalizePhone(input) {
  if (!input?.trim()) return null

  let digits = input.replace(/[\s()-]/g, '').replace(/^\+/, '')
  digits = digits.replace(/\D/g, '')

  if (digits.startsWith('8') && digits.length === 11) {
    digits = `7${digits.slice(1)}`
  }

  if (!/^7\d{10}$/.test(digits)) {
    return null
  }

  return digits
}

export function phoneToTechnicalEmail(phone) {
  return `${phone}${TECH_EMAIL_DOMAIN}`
}

export function technicalEmailToPhone(email) {
  if (!email?.endsWith(TECH_EMAIL_DOMAIN)) return null
  const phone = email.slice(0, -TECH_EMAIL_DOMAIN.length)
  return /^7\d{10}$/.test(phone) ? phone : null
}

export function formatPhoneDisplay(phone) {
  if (!phone || !/^7\d{10}$/.test(phone)) return phone || ''
  return `+7 ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7, 9)} ${phone.slice(9, 11)}`
}
