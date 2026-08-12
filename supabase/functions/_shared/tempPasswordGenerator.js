/**
 * Server-side generator for temporary employee passwords.
 * Plain JS (no TypeScript syntax) so both Deno (Edge Functions) and Node
 * (scripts/verify-admin-password-reset.mjs) can import this exact module.
 *
 * Uses crypto.getRandomValues (global in Deno and Node >=19) with rejection
 * sampling so every alphabet character has an equal chance of being picked.
 */

/** Uppercase letters + digits, minus visually ambiguous chars I, L, O, 0, 1. */
export const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TEMP_PASSWORD_GROUP_COUNT = 4
export const TEMP_PASSWORD_GROUP_LENGTH = 4

function randomAlphabetChar(alphabet) {
  // Largest multiple of alphabet.length that fits in a byte — values at or
  // above it are rejected and re-rolled so the modulo below stays unbiased.
  const limit = 256 - (256 % alphabet.length)
  const bytes = new Uint8Array(1)
  let value
  do {
    crypto.getRandomValues(bytes)
    value = bytes[0]
  } while (value >= limit)
  return alphabet[value % alphabet.length]
}

/**
 * Returns a readable high-entropy temporary password, e.g. "XK7P-9QRT-2MNB-XYZ4".
 */
export function generateTemporaryPassword({
  alphabet = TEMP_PASSWORD_ALPHABET,
  groupCount = TEMP_PASSWORD_GROUP_COUNT,
  groupLength = TEMP_PASSWORD_GROUP_LENGTH,
} = {}) {
  const groups = []
  for (let g = 0; g < groupCount; g += 1) {
    let group = ''
    for (let i = 0; i < groupLength; i += 1) {
      group += randomAlphabetChar(alphabet)
    }
    groups.push(group)
  }
  return groups.join('-')
}
