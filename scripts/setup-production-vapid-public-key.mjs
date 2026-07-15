#!/usr/bin/env node
/**
 * Production VAPID key setup / rotation.
 *
 * Usage:
 *   node scripts/setup-production-vapid-public-key.mjs --rotate [--overwrite]
 *   node scripts/setup-production-vapid-public-key.mjs --install-secrets
 *
 * Never prints private key or full public key.
 */

import { createECDH, createHash, timingSafeEqual } from 'crypto'
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { canonicalVapidFingerprint } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
const VAPID_SUBJECT = 'https://dakeci-lab.github.io/shugyla-academy/'
const PUBLIC_KEY_FILE = path.join(ROOT, 'config/production-vapid-public.key')
const DEFAULT_BACKUP_PATH = path.join(os.homedir(), '.shugyla-platform', 'secrets', 'production-vapid.env')

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    rotate: false,
    installSecrets: false,
    overwrite: false,
    backupPath: DEFAULT_BACKUP_PATH,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--rotate') args.rotate = true
    else if (arg === '--install-secrets') args.installSecrets = true
    else if (arg === '--overwrite') args.overwrite = true
    else if (arg === '--backup-path') {
      args.backupPath = argv[i + 1]
      i += 1
    } else fail(`Unknown argument: ${arg}`)
  }
  if (!args.rotate && !args.installSecrets) {
    fail('Specify --rotate and/or --install-secrets')
  }
  if (args.rotate && args.installSecrets) {
    fail('Use --rotate and --install-secrets in separate invocations')
  }
  return args
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

function assertBackupOutsideRepository(backupPath) {
  const resolvedBackup = path.resolve(backupPath)
  const resolvedRoot = path.resolve(ROOT)
  if (resolvedBackup === resolvedRoot || resolvedBackup.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail('Backup path must be outside the repository')
  }
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', resolvedBackup], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (tracked.status === 0) {
    fail('Backup path must not be a tracked Git file')
  }
}

function normalizeB64url(value, label) {
  if (!value || typeof value !== 'string') fail(`Missing ${label}`)
  const trimmed = value.trim()
  if (/["'`]/.test(trimmed)) fail(`${label} contains quotes`)
  if (/BEGIN|END|-----/.test(trimmed)) fail(`${label} looks like PEM`)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) fail(`${label} looks like JSON`)
  return trimmed
}

function decodeB64url(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from((value + padding).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function verifyKeyPair(publicB64, privateB64) {
  const pubRaw = decodeB64url(publicB64)
  const privRaw = decodeB64url(privateB64)
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) fail('Invalid public key length or prefix')
  if (privRaw.length !== 32) fail('Invalid private key length')
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(privRaw)
  const derived = ecdh.getPublicKey(null, 'uncompressed')
  if (derived.length !== pubRaw.length || !timingSafeEqual(derived, pubRaw)) {
    fail('VAPID public/private pair mismatch')
  }
  return {
    publicDecodedBytes: pubRaw.length,
    privateDecodedBytes: privRaw.length,
    fingerprint: canonicalVapidFingerprint(publicB64),
    keyPairMatches: true,
  }
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
  verifyKeyPair(publicB64, privateB64)
  return { publicB64, privateB64 }
}

function writeBackupEnv(backupPath, publicB64, privateB64) {
  assertBackupOutsideRepository(backupPath)
  const dir = path.dirname(backupPath)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try {
    statSync(dir).mode & 0o777
  } catch {
    fail('Unable to stat backup directory')
  }
  writeFileSync(
    backupPath,
    `VAPID_PUBLIC_KEY=${publicB64}\nVAPID_PRIVATE_KEY=${privateB64}\nVAPID_SUBJECT=${VAPID_SUBJECT}\n`,
    { mode: 0o600 }
  )
}

function readBackupEnv(backupPath) {
  if (!existsSync(backupPath)) fail('Secure backup file not found')
  const content = readFileSync(backupPath, 'utf8')
  const values = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  const keys = Object.keys(values).sort()
  if (keys.join(',') !== 'VAPID_PRIVATE_KEY,VAPID_PUBLIC_KEY,VAPID_SUBJECT') {
    fail('Backup must contain exactly three VAPID variables')
  }
  return {
    publicB64: normalizeB64url(values.VAPID_PUBLIC_KEY, 'VAPID_PUBLIC_KEY'),
    privateB64: normalizeB64url(values.VAPID_PRIVATE_KEY, 'VAPID_PRIVATE_KEY'),
    subject: values.VAPID_SUBJECT.trim(),
  }
}

function installSecretsFromBackup(backupPath) {
  const refPath = path.join(ROOT, 'supabase/.temp/project-ref')
  if (!existsSync(refPath) || readFileSync(refPath, 'utf8').trim() !== PRODUCTION_REF) {
    fail('Production project must be linked before installing secrets')
  }
  const { publicB64, privateB64, subject } = readBackupEnv(backupPath)
  if (subject !== VAPID_SUBJECT) fail('Backup subject does not match expected production subject')
  const verified = verifyKeyPair(publicB64, privateB64)

  const tempSecrets = path.join(os.tmpdir(), `shugyla-vapid-${process.pid}-${Date.now()}.env`)
  writeFileSync(
    tempSecrets,
    `VAPID_PUBLIC_KEY=${publicB64}\nVAPID_PRIVATE_KEY=${privateB64}\nVAPID_SUBJECT=${subject}\n`,
    { mode: 0o600 }
  )

  try {
    run(['secrets', 'set', '--project-ref', PRODUCTION_REF, '--env-file', tempSecrets])
  } finally {
    unlinkSync(tempSecrets)
  }

  console.log(JSON.stringify({
    ok: true,
    action: 'install-secrets',
    canonicalFingerprint: verified.fingerprint,
    publicDecodedBytes: verified.publicDecodedBytes,
    privateDecodedBytes: verified.privateDecodedBytes,
    keyPairMatches: true,
    backupExists: existsSync(backupPath),
    backupMode: '600',
  }))
}

function rotate(args) {
  assertBackupOutsideRepository(args.backupPath)
  if (existsSync(args.backupPath) && !args.overwrite) {
    fail('Secure backup already exists; pass --overwrite to replace')
  }

  const { publicB64, privateB64 } = generateVapidPair()
  const verified = verifyKeyPair(publicB64, privateB64)

  writeBackupEnv(args.backupPath, publicB64, privateB64)

  mkdirSync(path.dirname(PUBLIC_KEY_FILE), { recursive: true })
  writeFileSync(PUBLIC_KEY_FILE, `${publicB64}\n`, { mode: 0o644 })

  console.log(JSON.stringify({
    ok: true,
    action: 'rotate',
    canonicalFingerprint: verified.fingerprint,
    publicDecodedBytes: verified.publicDecodedBytes,
    privateDecodedBytes: verified.privateDecodedBytes,
    keyPairMatches: true,
    backupExists: existsSync(args.backupPath),
    backupMode: '600',
    publicKeyFileUpdated: true,
  }))
}

export {
  DEFAULT_BACKUP_PATH,
  PUBLIC_KEY_FILE,
  VAPID_SUBJECT,
  assertBackupOutsideRepository,
  decodeB64url,
  generateVapidPair,
  readBackupEnv,
  verifyKeyPair,
  writeBackupEnv,
}

function main() {
  const args = parseArgs(process.argv)
  if (args.rotate) rotate(args)
  if (args.installSecrets) installSecretsFromBackup(args.backupPath)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
