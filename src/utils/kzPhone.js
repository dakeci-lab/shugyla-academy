/**
 * Kazakhstan mobile phone normalization — mirrors normalize_kz_mobile_phone()
 * in supabase/migrations/20260812161033_recruitment_candidate_people_idempotency.sql.
 * Server is authoritative; this is for instant client-side feedback only.
 */

export const KZ_PHONE_FIXED_PREFIX = '+7 7'
export const KZ_PHONE_PLACEHOLDER = '+7 7XX XXX XX XX'
export const KZ_PHONE_TAIL_LENGTH = 9

/** Canonicalizes to E.164 +77XXXXXXXXX, or null if not a valid KZ mobile number. */
export function normalizeKzMobilePhone(input) {
  if (input == null) return null

  let digits = String(input).replace(/[^0-9]/g, '')
  if (!digits) return null

  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`
  }
  if (digits.length === 10 && digits.startsWith('7')) {
    digits = `7${digits}`
  }

  if (/^77\d{9}$/.test(digits)) {
    return `+${digits}`
  }
  return null
}

/** Formats a canonical +77XXXXXXXXX phone as "+7 7XX XXX XX XX". */
export function formatKzMobileDisplay(canonical) {
  const digits = String(canonical || '').replace(/[^0-9]/g, '')
  if (!/^77\d{9}$/.test(digits)) return canonical || ''
  return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`
}

/** Groups the raw 9-digit tail (after the fixed +7 7 prefix) as "XX XXX XX XX". */
export function groupKzPhoneTail(tailDigits) {
  const digits = String(tailDigits || '').replace(/[^0-9]/g, '').slice(0, KZ_PHONE_TAIL_LENGTH)
  const p1 = digits.slice(0, 2)
  const p2 = digits.slice(2, 5)
  const p3 = digits.slice(5, 7)
  const p4 = digits.slice(7, 9)
  return [p1, p2, p3, p4].filter(Boolean).join(' ')
}

/**
 * Extracts a clean 9-digit tail from raw user input, tolerating pasted full
 * numbers (with +7/8/77 prefixes) by stripping the recognizable prefix.
 */
export function extractKzPhoneTail(rawInput) {
  let digits = String(rawInput || '').replace(/[^0-9]/g, '')

  // Same length-based reshaping as normalizeKzMobilePhone, so a pasted
  // "8 7XX XXX XX XX" or bare "7XX XXX XX XX" lines up on the same 2-digit
  // (country + mobile prefix) boundary before we strip it off.
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`
  } else if (digits.length === 10 && digits.startsWith('7')) {
    digits = `7${digits}`
  }

  if (digits.length > KZ_PHONE_TAIL_LENGTH) {
    digits = digits.startsWith('77') ? digits.slice(2) : digits.slice(-KZ_PHONE_TAIL_LENGTH)
  }

  return digits.slice(0, KZ_PHONE_TAIL_LENGTH)
}

/** Full display string sent as the answer value: "+7 7XX XXX XX XX". */
export function kzPhoneTailToDisplay(tailDigits) {
  return `${KZ_PHONE_FIXED_PREFIX}${tailDigits ? ' ' : ''}${groupKzPhoneTail(tailDigits)}`.trim()
}

/** Client-side validation message in Russian, or null if the tail is complete. */
export function validateKzPhoneTail(tailDigits) {
  const digits = String(tailDigits || '').replace(/[^0-9]/g, '')
  if (digits.length === 0) return 'Введите номер телефона'
  if (digits.length < KZ_PHONE_TAIL_LENGTH) {
    return 'Номер введён не полностью. Нужно 9 цифр после +7 7'
  }
  if (digits.length > KZ_PHONE_TAIL_LENGTH) {
    return 'Слишком много цифр. Нужно 9 цифр после +7 7'
  }
  return null
}
