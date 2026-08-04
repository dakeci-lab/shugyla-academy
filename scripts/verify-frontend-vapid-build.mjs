#!/usr/bin/env node
/**
 * Build-time / post-build check that the Vite bundle embeds the expected VAPID public key.
 *
 * Usage:
 *   npm run verify:frontend-vapid-build
 *   npm run verify:frontend-vapid-build -- --dist dist
 */

import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { canonicalVapidFingerprint, normalizeVapidPublicKey } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_KEY_FILE = path.join(ROOT, 'config/production-vapid-public.key')

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  let dist = path.join(ROOT, 'dist')
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--dist') {
      dist = path.resolve(argv[i + 1])
      i += 1
    }
  }
  return { dist }
}

function main() {
  if (!existsSync(PUBLIC_KEY_FILE)) fail('Missing config/production-vapid-public.key')
  const configKey = normalizeVapidPublicKey(readFileSync(PUBLIC_KEY_FILE, 'utf8'))
  if (!configKey) fail('Empty production VAPID public key')
  const expectedFp = canonicalVapidFingerprint(configKey)

  const { dist } = parseArgs(process.argv)
  if (!existsSync(dist)) {
    console.log(JSON.stringify({ ok: true, mode: 'config-only', config_fingerprint: expectedFp }))
    return
  }

  const assetsDir = path.join(dist, 'assets')
  if (!existsSync(assetsDir)) fail('dist/assets missing — run npm run build first')

  const files = readdirSync(assetsDir).filter((name) => name.endsWith('.js'))
  let found = false
  for (const name of files) {
    const content = readFileSync(path.join(assetsDir, name), 'utf8')
    if (content.includes(configKey)) {
      found = true
      break
    }
  }

  if (!found) fail(`Built assets do not embed expected VAPID public key (fp ${expectedFp})`)

  console.log(
    JSON.stringify({
      ok: true,
      mode: 'dist',
      config_fingerprint: expectedFp,
      key_embedded: true,
    })
  )
}

main()
