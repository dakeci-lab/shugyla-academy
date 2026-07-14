#!/usr/bin/env node
/**
 * Verify local VAPID key integrity without printing secrets.
 *
 * Usage:
 *   npm run webpush:local:verify-vapid-integrity
 */

import { createECDH } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import {
  canonicalVapidFingerprint,
  isValidBase64urlKey,
  legacyFingerprintBase64urlString,
  legacyFingerprintRawBuffer,
} from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SECRETS_FILE = path.join(ROOT, '.local-secrets/web-push.env')
const ENV_LOCAL = path.join(ROOT, '.env.local')
const EDGE_ENV = path.join(ROOT, 'supabase/functions/.env')
const PROJECT_ID = 'shugyla-academy'
const MANUAL_LOGIN = 'web-push-manual-staff'
const STEP18_LEGACY_FINGERPRINT = '71653018b9bcdd1b'
const STEP21B_LEGACY_STRING_FP = '684e162f76d9bd71'

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function parseEnv(content) {
  const values = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return values
}

function verifyKeyPair(publicB64, privateB64) {
  const publicRaw = Buffer.from(publicB64, 'base64url')
  const privateRaw = Buffer.from(privateB64, 'base64url')
  if (publicRaw.length !== 65 || privateRaw.length !== 32) return false

  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(privateRaw)
  const derived = ecdh.getPublicKey()
  return derived.equals(publicRaw)
}

function psqlScalar(sql) {
  const container = `supabase_db_${PROJECT_ID}`
  const result = spawnSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' }
  )
  if (result.status !== 0) {
    fail('Local database unavailable for subscription check')
  }
  return result.stdout.trim()
}

function main() {
  if (!existsSync(SECRETS_FILE)) {
    fail('Missing .local-secrets/web-push.env — run npm run webpush:local:generate-vapid first')
  }
  if (!existsSync(ENV_LOCAL)) {
    fail('Missing .env.local')
  }
  if (!existsSync(EDGE_ENV)) {
    fail('Missing supabase/functions/.env — run npm run webpush:local:prepare-edge-env first')
  }

  const secrets = parseEnv(readFileSync(SECRETS_FILE, 'utf8'))
  const envLocal = parseEnv(readFileSync(ENV_LOCAL, 'utf8'))
  const edgeEnv = parseEnv(readFileSync(EDGE_ENV, 'utf8'))

  const publicFromSecrets = secrets.VAPID_PUBLIC_KEY
  const privateFromSecrets = secrets.VAPID_PRIVATE_KEY
  const subjectFromSecrets = secrets.VAPID_SUBJECT
  const publicFromVite = envLocal.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
  const publicFromEdge = edgeEnv.VAPID_PUBLIC_KEY
  const privateFromEdge = edgeEnv.VAPID_PRIVATE_KEY
  const subjectFromEdge = edgeEnv.VAPID_SUBJECT

  if (!publicFromSecrets || !privateFromSecrets || !subjectFromSecrets) {
    fail('web-push.env missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_SUBJECT')
  }
  if (!publicFromVite) fail('.env.local missing VITE_WEB_PUSH_VAPID_PUBLIC_KEY')
  if (!publicFromEdge || !privateFromEdge || !subjectFromEdge) {
    fail('Edge env missing VAPID keys or subject')
  }

  const frontendMatchesEdge =
    publicFromVite === publicFromEdge && publicFromEdge === publicFromSecrets
  const keyPairValid = verifyKeyPair(publicFromSecrets, privateFromSecrets)
  const edgePairValid = verifyKeyPair(publicFromEdge, privateFromEdge)

  if (!isValidBase64urlKey(publicFromSecrets) || !isValidBase64urlKey(privateFromSecrets)) {
    fail('Invalid base64url VAPID key format')
  }

  if (!frontendMatchesEdge) fail('Frontend and Edge VAPID public keys do not match')
  if (!keyPairValid || !edgePairValid) fail('VAPID private key does not match public key')

  const publicRaw = Buffer.from(publicFromSecrets, 'base64url')
  const canonical = canonicalVapidFingerprint(publicFromSecrets)
  const legacyString = legacyFingerprintBase64urlString(publicFromSecrets)
  const legacyRaw = legacyFingerprintRawBuffer(publicRaw)

  let legacyFingerprintMatch = 'none'
  if (canonical === STEP18_LEGACY_FINGERPRINT || legacyRaw === STEP18_LEGACY_FINGERPRINT) {
    legacyFingerprintMatch = 'step18_raw_bytes'
  } else if (legacyString === STEP21B_LEGACY_STRING_FP) {
    legacyFingerprintMatch = 'step21b_base64url_string'
  }

  const subscriptionActive =
    psqlScalar(`
      SELECT COUNT(*)::text FROM public.notification_push_subscriptions s
      INNER JOIN public.academy_users u ON u.id = s.employee_id
      WHERE u.login = '${MANUAL_LOGIN}' AND s.is_active = true AND s.permission_status = 'granted';
    `) === '1'

  const result = {
    frontendMatchesEdge: true,
    keyPairValid: true,
    canonicalFingerprint: canonical,
    legacyFingerprintMatch,
    fingerprintExplanation:
      legacyFingerprintMatch === 'step18_raw_bytes'
        ? 'Step 18 used SHA-256(raw public key bytes); Step 21B prepare script used SHA-256(base64url string). Same key pair.'
        : 'Canonical fingerprint uses decoded raw bytes per docs.',
    legacyFingerprints: {
      rawBytes: legacyRaw,
      base64urlString: legacyString,
      step18Expected: STEP18_LEGACY_FINGERPRINT,
      step21bExpected: STEP21B_LEGACY_STRING_FP,
    },
    subjectPresent: Boolean(subjectFromEdge),
    subscriptionActive,
  }

  console.log(JSON.stringify(result, null, 2))

  if (!subscriptionActive) {
    fail('Manual browser subscription is not active/granted')
  }
}

main()
