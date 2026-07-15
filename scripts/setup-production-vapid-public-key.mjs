#!/usr/bin/env node
/**
 * Generate production VAPID pair (when public key not recoverable) and install:
 * - Supabase Edge secrets (write-only API)
 * - config/production-vapid-public.key for GitHub Pages build
 *
 * Usage:
 *   node scripts/setup-production-vapid-public-key.mjs
 *
 * Requires: linked or --project-ref cxadzerxndlscwvdaymk, subscriptions = 0
 * Never prints private key or full public key.
 */

import { createECDH, createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { canonicalVapidFingerprint } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const VAPID_SUBJECT = 'https://dakeci-lab.github.io/shugyla-academy/'
const PUBLIC_KEY_FILE = path.join(ROOT, 'config/production-vapid-public.key')

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function run(args, { capture = false } = {}) {
  const result = spawnSync('npm', ['exec', '--yes', 'supabase@2.109.1', '--', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0) {
    fail(`supabase ${args.join(' ')} exited ${result.status}`)
  }
  return result
}

function dbScalar(sql) {
  const result = run(['db', 'query', '--linked', sql, '-o', 'json'], { capture: true })
  const jsonStart = result.stdout.indexOf('{')
  if (jsonStart < 0) fail('db query returned no JSON')
  const payload = JSON.parse(result.stdout.slice(jsonStart))
  const row = payload.rows?.[0]
  if (!row) fail('db query returned no rows')
  return row[Object.keys(row)[0]]
}

function generateVapidPair() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const publicKey = ecdh.getPublicKey()
  const privateKey = ecdh.getPrivateKey()
  if (publicKey.length !== 65 || privateKey.length !== 32) {
    fail('Unexpected EC key length')
  }
  const publicB64 = Buffer.from(publicKey).toString('base64url')
  const privateB64 = Buffer.from(privateKey).toString('base64url')
  const fingerprint = canonicalVapidFingerprint(publicB64)

  // Verify pair: same seed produces same keys
  const check = createECDH('prime256v1')
  check.setPrivateKey(privateKey)
  const derivedPublic = check.getPublicKey()
  if (!derivedPublic.equals(publicKey)) {
    fail('VAPID public/private pair mismatch')
  }

  return { publicB64, privateB64, fingerprint }
}

function main() {
  console.log('=== Production VAPID public key setup ===\n')

  const refPath = path.join(ROOT, 'supabase/.temp/project-ref')
  if (!existsSync(refPath) || readFileSync(refPath, 'utf8').trim() !== PRODUCTION_REF) {
    fail('Production project must be linked before running this script')
  }

  const subscriptions = dbScalar(
    'select count(*)::int as c from public.notification_push_subscriptions;'
  )
  if (subscriptions !== 0) {
    fail(`Refusing to rotate VAPID: subscriptions=${subscriptions} (expected 0)`)
  }

  const { publicB64, privateB64, fingerprint } = generateVapidPair()

  const tempSecrets = path.join('/tmp', `shugyla-vapid-${process.pid}.env`)
  writeFileSync(
    tempSecrets,
    `VAPID_PUBLIC_KEY=${publicB64}\nVAPID_PRIVATE_KEY=${privateB64}\nVAPID_SUBJECT=${VAPID_SUBJECT}\n`,
    { mode: 0o600 }
  )

  try {
    run([
      'secrets',
      'set',
      '--project-ref',
      PRODUCTION_REF,
      '--env-file',
      tempSecrets,
    ])
  } finally {
    unlinkSync(tempSecrets)
  }

  mkdirSync(path.dirname(PUBLIC_KEY_FILE), { recursive: true })
  writeFileSync(PUBLIC_KEY_FILE, `${publicB64}\n`, { mode: 0o644 })

  console.log('  ✓ Supabase VAPID secrets updated')
  console.log('  ✓ production-vapid-public.key written')
  console.log(`  ✓ canonical fingerprint: ${fingerprint}`)
  console.log(`  ✓ VAPID_SUBJECT: ${VAPID_SUBJECT}`)
  console.log('\nProduction VAPID setup completed (exit 0)\n')
}

main()
