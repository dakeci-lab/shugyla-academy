#!/usr/bin/env node
/**
 * Safe production/frontend VAPID alignment checks (no secret values printed).
 *
 * Usage:
 *   npm run verify:production-vapid-alignment
 */

import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { canonicalVapidFingerprint, normalizeVapidPublicKey } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_KEY_FILE = path.join(ROOT, 'config/production-vapid-public.key')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const EXPECTED_SUBJECT = 'https://shugyla-market.kz/'

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    failed += 1
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
    return
  }
  passed += 1
  console.log(`  ✓ ${name}`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function main() {
  console.log('Production VAPID alignment')

  assert('config public key file exists', existsSync(PUBLIC_KEY_FILE))
  const configKey = normalizeVapidPublicKey(readFileSync(PUBLIC_KEY_FILE, 'utf8'))
  assert('config public key non-empty', Boolean(configKey))
  assert('config public key format', Boolean(configKey && configKey.length >= 80))

  const configFp = canonicalVapidFingerprint(configKey)
  assert('config fingerprint length 16', configFp.length === 16)
  console.log(`  · config_fingerprint=${configFp}`)

  const secrets = spawnSync(
    'npm',
    ['exec', '--yes', 'supabase@2.109.1', '--', 'secrets', 'list', '--project-ref', PRODUCTION_REF, '-o', 'json'],
    { cwd: ROOT, encoding: 'utf8' }
  )
  assert('secrets list reachable', secrets.status === 0, (secrets.stderr || '').slice(0, 200))
  if (secrets.status !== 0) {
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(1)
  }

  const rows = JSON.parse(secrets.stdout.match(/\[[\s\S]*\]/)[0])
  const by = Object.fromEntries(rows.map((row) => [row.name, row.value]))

  assert('VAPID_PUBLIC_KEY present', Boolean(by.VAPID_PUBLIC_KEY))
  assert('VAPID_PRIVATE_KEY present', Boolean(by.VAPID_PRIVATE_KEY))
  assert('VAPID_SUBJECT present', Boolean(by.VAPID_SUBJECT))
  assert(
    'config public digest matches production secret',
    by.VAPID_PUBLIC_KEY === sha256(configKey)
  )
  assert(
    'VAPID_SUBJECT is production HTTPS app URL',
    by.VAPID_SUBJECT === sha256(EXPECTED_SUBJECT)
  )
  assert(
    'WEB_PUSH_PRODUCTION_TEST_ENABLED is true',
    by.WEB_PUSH_PRODUCTION_TEST_ENABLED === sha256('true')
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
