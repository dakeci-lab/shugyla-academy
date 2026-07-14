#!/usr/bin/env node
/**
 * Generate local-only VAPID key pair for Web Push development.
 *
 * Usage:
 *   npm run webpush:local:generate-vapid
 *   npm run webpush:local:generate-vapid -- --force
 */

import { createECDH } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { canonicalVapidFingerprint } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SECRETS_DIR = path.join(ROOT, '.local-secrets')
const SECRETS_FILE = path.join(SECRETS_DIR, 'web-push.env')
const ENV_LOCAL = path.join(ROOT, '.env.local')
const PRODUCTION_MARKERS = ['supabase.co', 'cxadzerxndlscwvdaymk']

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`)
  process.exit(code)
}

function assertLocalEnvironment() {
  const envUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ||
    ''

  for (const marker of PRODUCTION_MARKERS) {
    if (envUrl.includes(marker)) {
      fail(`Refusing to generate VAPID keys when production marker detected: ${marker}`)
    }
  }

  if (process.env.CI && process.env.SUPABASE_PROJECT_REF) {
    fail('Refusing to generate VAPID keys in linked CI environment')
  }
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function fingerprint(publicKeyBuffer) {
  return canonicalVapidFingerprint(Buffer.from(publicKeyBuffer).toString('base64url'))
}

function parseEnvFile(content) {
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

function upsertEnvLine(content, key, value) {
  const lines = content.split('\n')
  let found = false
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) {
    if (next.length && next[next.length - 1] !== '') next.push('')
    next.push(`${key}=${value}`)
  }
  return next.join('\n').replace(/\n?$/, '\n')
}

function main() {
  const force = process.argv.includes('--force')
  assertLocalEnvironment()

  if (existsSync(SECRETS_FILE) && !force) {
    fail('Local VAPID keys already exist. Use --force to regenerate.')
  }

  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const publicKey = ecdh.getPublicKey()
  const privateKey = ecdh.getPrivateKey()

  if (publicKey.length !== 65 || privateKey.length !== 32) {
    fail('Unexpected EC key length from createECDH')
  }

  const publicB64 = base64url(publicKey)
  const privateB64 = base64url(privateKey)
  const subject = 'mailto:dev@shugyla.local'

  mkdirSync(SECRETS_DIR, { recursive: true })
  writeFileSync(
    SECRETS_FILE,
    [
      '# Local Web Push VAPID keys — never commit',
      `VAPID_PUBLIC_KEY=${publicB64}`,
      `VAPID_PRIVATE_KEY=${privateB64}`,
      `VAPID_SUBJECT=${subject}`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  )

  let envLocal = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8') : ''
  envLocal = upsertEnvLine(envLocal, 'VITE_WEB_PUSH_VAPID_PUBLIC_KEY', publicB64)
  if (!envLocal.includes('# Local Web Push')) {
    envLocal = `# Local Web Push (public key only)\n${envLocal}`
  }
  writeFileSync(ENV_LOCAL, envLocal, { mode: 0o600 })

  console.log('Local VAPID keys generated successfully')
  console.log(`Secrets file: ${SECRETS_FILE}`)
  console.log(`Public key fingerprint: ${fingerprint(publicKey)}`)
  console.log('Private key present: true')
}

main()
