const TECH_EMAIL_DOMAIN = '@shugyla.local'

/** Mirrors src/utils/phoneUtils.js → normalizePhone */
export function normalizePhone(input: string | null | undefined): string | null {
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

export function phoneToTechnicalEmail(phone: string): string {
  return `${phone}${TECH_EMAIL_DOMAIN}`
}

/** Mirrors src/utils/phoneUtils.js → loginToTechnicalEmail */
export function loginToTechnicalEmail(loginValue: string | null | undefined): string | null {
  const login = loginValue?.trim()
  if (!login) return null
  if (login.includes('@')) return login.toLowerCase()
  const phone = normalizePhone(login)
  if (phone) return phoneToTechnicalEmail(phone)
  return `${login.toLowerCase()}${TECH_EMAIL_DOMAIN}`
}

/** Canonical academy_users.login stored in database */
export function canonicalLogin(loginValue: string): string {
  const login = loginValue.trim()
  if (!login) return ''
  if (login.includes('@')) return login.toLowerCase()
  const phone = normalizePhone(login)
  if (phone) return phone
  return login.toLowerCase()
}
