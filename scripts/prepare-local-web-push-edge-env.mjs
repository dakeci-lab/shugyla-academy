#!/usr/bin/env node
/**
 * Prepare local Edge Function env for Web Push sender (VAPID secrets).
 *
 * Usage:
 *   npm run webpush:local:prepare-edge-env
 */

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SECRETS_FILE = path.join(ROOT, '.local-secrets/web-push.env')
const ENV_LOCAL = path.join(ROOT, '.env.local')
const EDGE_ENV = path.join(ROOT, 'supabase/functions/.env')
const PRODUCTION_MARKERS = ['supabase.co', 'cxadzerxndlscwvdaymk']

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

function upsertLine(content, key, value) {
  const lines = content.split('\n')
  let found = false
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) next.push(`${key}=${value}`)
  return `${next.join('\n').replace(/\n?$/, '\n')}`
}

function assertLocalEnvironment() {
  const envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  for (const marker of PRODUCTION_MARKERS) {
    if (envUrl.includes(marker)) {
      fail(`Refusing to prepare Edge env when production marker detected: ${marker}`)
    }
  }

  if (existsSync(ENV_LOCAL)) {
    const local = readFileSync(ENV_LOCAL, 'utf8')
    for (const marker of PRODUCTION_MARKERS) {
      if (local.includes(marker)) {
        fail(`Refusing to prepare Edge env: .env.local contains production marker ${marker}`)
      }
    }
    if (!local.includes('127.0.0.1:54321') && !local.includes('localhost:54321')) {
      fail('Refusing to prepare Edge env: .env.local is not pointing to local Supabase')
    }
  }
}

function validateKey(name, value) {
  if (!value || typeof value !== 'string' || value.length < 20) {
    fail(`Invalid ${name} format`)
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    fail(`Invalid ${name} encoding`)
  }
}

function validateSubject(subject) {
  if (!subject || (!subject.startsWith('mailto:') && !subject.startsWith('https://'))) {
    fail('Invalid VAPID_SUBJECT format')
  }
}

function fingerprint(publicKey) {
  return createHash('sha256').update(publicKey).digest('hex').slice(0, 16)
}

function main() {
  assertLocalEnvironment()

  if (!existsSync(SECRETS_FILE)) {
    fail('Missing .local-secrets/web-push.env — run npm run webpush:local:generate-vapid first')
  }

  const secrets = parseEnv(readFileSync(SECRETS_FILE, 'utf8'))
  const publicKey = secrets.VAPID_PUBLIC_KEY
  const privateKey = secrets.VAPID_PRIVATE_KEY
  const subject = secrets.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    fail('web-push.env must contain VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT')
  }

  validateKey('VAPID_PUBLIC_KEY', publicKey)
  validateKey('VAPID_PRIVATE_KEY', privateKey)
  validateSubject(subject)

  if (existsSync(ENV_LOCAL)) {
    const viteEnv = parseEnv(readFileSync(ENV_LOCAL, 'utf8'))
    const vitePublic = viteEnv.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
    if (vitePublic && vitePublic !== publicKey) {
      fail('VAPID public key mismatch between .local-secrets and .env.local')
    }
  }

  mkdirSync(path.dirname(EDGE_ENV), { recursive: true })

  let edgeEnv = existsSync(EDGE_ENV) ? readFileSync(EDGE_ENV, 'utf8') : ''
  edgeEnv = upsertLine(edgeEnv, 'VAPID_PUBLIC_KEY', publicKey)
  edgeEnv = upsertLine(edgeEnv, 'VAPID_PRIVATE_KEY', privateKey)
  edgeEnv = upsertLine(edgeEnv, 'VAPID_SUBJECT', subject)
  edgeEnv = upsertLine(edgeEnv, 'WEB_PUSH_TEST_ENABLED', 'true')

  if (!edgeEnv.includes('# Local Web Push Edge env')) {
    edgeEnv = `# Local Web Push Edge env — never commit\n${edgeEnv}`
  }

  writeFileSync(EDGE_ENV, edgeEnv, { mode: 0o600 })

  const SUPABASE_ENV_LOCAL = path.join(ROOT, 'supabase/.env.local')
  writeFileSync(SUPABASE_ENV_LOCAL, edgeEnv, { mode: 0o600 })

  console.log('Local Web Push Edge env prepared successfully')
  console.log(`Destination: ${EDGE_ENV}`)
  console.log(`Supabase local env: ${SUPABASE_ENV_LOCAL}`)
  console.log(`Public key fingerprint: ${fingerprint(publicKey)}`)
  console.log('Private key present: true')
}

main()
