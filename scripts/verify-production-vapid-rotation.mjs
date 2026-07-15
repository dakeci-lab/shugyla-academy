#!/usr/bin/env node
/**
 * Verify production VAPID rotation safety requirements.
 *
 * Usage:
 *   npm run verify:production-vapid-rotation
 */

import { createECDH, createHash, timingSafeEqual } from 'crypto'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  DEFAULT_BACKUP_PATH,
  PUBLIC_KEY_FILE,
  VAPID_SUBJECT,
  assertBackupOutsideRepository,
  generateVapidPair,
  readBackupEnv,
  verifyKeyPair,
  writeBackupEnv,
} from './setup-production-vapid-public-key.mjs'
import { canonicalVapidFingerprint } from './lib/vapid-fingerprint.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let testsRun = 0
let testsPassed = 0

function fail(message) {
  throw new Error(message)
}

function assert(name, condition, detail = '') {
  testsRun += 1
  if (!condition) fail(`${name}${detail ? `: ${detail}` : ''}`)
  testsPassed += 1
  console.log(`  ✓ ${name}`)
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  })
}

function stageScriptSafety() {
  console.log('Stage 1: Rotation script safety')
  const script = read('scripts/setup-production-vapid-public-key.mjs')
  assert('requires --rotate or --install-secrets', script.includes("'Specify --rotate and/or --install-secrets'"))
  assert('separate rotate and install invocations', script.includes('Use --rotate and --install-secrets in separate invocations'))
  assert('backup outside repository guard', script.includes('assertBackupOutsideRepository'))
  assert('overwrite guard', script.includes('--overwrite'))
  assert('permanent backup write', script.includes('writeBackupEnv'))
  assert('temp env removed after secrets install', script.includes('unlinkSync(tempSecrets)'))
  assert('does not delete permanent backup', !script.includes('unlinkSync(backupPath)'))
  assert('private key not logged', !script.match(/console\.log\([^)]*privateB64/))
  assert('only fingerprint in rotate output', script.includes('canonicalFingerprint'))
  console.log('')
}

function stageCryptography() {
  console.log('Stage 2: Cryptographic pair generation')
  const { publicB64, privateB64 } = generateVapidPair()
  const verified = verifyKeyPair(publicB64, privateB64)
  assert('public decoded bytes = 65', verified.publicDecodedBytes === 65)
  assert('private decoded bytes = 32', verified.privateDecodedBytes === 32)
  assert('key pair matches', verified.keyPairMatches === true)
  assert('fingerprint length = 16', verified.fingerprint.length === 16)
  console.log('')
}

function stageSecureBackup() {
  console.log('Stage 3: Secure backup behavior')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shugyla-vapid-verify-'))
  const backupPath = path.join(tempDir, 'production-vapid.env')
  const { publicB64, privateB64 } = generateVapidPair()

  assertBackupOutsideRepository(backupPath)
  writeBackupEnv(backupPath, publicB64, privateB64)
  assert('backup exists', fs.existsSync(backupPath))
  const backupStat = fs.statSync(backupPath)
  assert('backup mode 600', (backupStat.mode & 0o777) === 0o600)
  const dirStat = fs.statSync(path.dirname(backupPath))
  assert('directory mode 700', (dirStat.mode & 0o777) === 0o700)

  const parsed = readBackupEnv(backupPath)
  assert('backup has three variables subject', parsed.subject === VAPID_SUBJECT)
  verifyKeyPair(parsed.publicB64, parsed.privateB64)

  const rotateResult = run('node', ['scripts/setup-production-vapid-public-key.mjs', '--rotate', '--backup-path', backupPath], {
    capture: true,
  })
  assert('rotate refuses existing backup without overwrite', rotateResult.status !== 0)

  fs.unlinkSync(backupPath)
  fs.rmdirSync(tempDir)
  console.log('')
}

function stageGitAndConfig() {
  console.log('Stage 4: Git and config scope')
  const trackedBackup = run('git', ['ls-files', DEFAULT_BACKUP_PATH], { capture: true })
  assert('default backup path not tracked', !trackedBackup.stdout.trim())

  const publicKey = read('config/production-vapid-public.key').trim()
  assert('config public key present', publicKey.length > 20)
  assert('config has no private key line', !read('config/production-vapid-public.key').includes('VAPID_PRIVATE_KEY'))

  const gitPrivate = run('git', ['grep', '-n', 'VAPID_PRIVATE_KEY', '--', 'src', 'dist', 'public', 'config'], {
    capture: true,
    allowFailure: true,
  })
  assert('private key name absent from tracked src/dist/public/config values', !gitPrivate.stdout.includes('='))

  const deploy = read('.github/workflows/deploy.yml')
  assert('deploy reads production public key file', deploy.includes('config/production-vapid-public.key'))
  console.log('')
}

function stageFrontendRotationFlow() {
  console.log('Stage 5: Frontend rotation flow')
  const service = read('src/services/webPushSubscriptionService.js')
  assert('missing applicationServerKey treated as mismatch', service.includes('if (!subKey) return false'))
  assert('registered vapid fingerprint key', service.includes('shugyla.web_push.registered_vapid_fingerprint'))
  assert('persist fingerprint after register', service.includes('persistRegisteredVapidFingerprint'))
  assert('prepare checks fingerprint mismatch', service.includes('registeredVapidFingerprintMismatch'))
  assert('controlled unsubscribe on mismatch', service.includes('clearStaleBrowserSubscriptionForVapidRotation'))
  assert('prepare uses resolveBrowserSubscription', service.includes('resolveBrowserSubscription(registration, vapidPublicKey)'))
  assert('backend register before status check in prepare', service.indexOf('registerBrowserSubscriptionWithBackend') < service.indexOf('getDeviceTestSendStatus()'))
  assert('no auto send in prepare', !service.match(/prepareDeviceForTestSend[\s\S]{0,400}sendServerTestWebPush/))
  console.log('')
}

function stageFingerprints() {
  console.log('Stage 6: Old vs new fingerprint guard')
  const oldFp = '3766a407dc40a509'
  const { publicB64 } = generateVapidPair()
  const newFp = canonicalVapidFingerprint(publicB64)
  assert('new fingerprint differs from old production fingerprint', newFp !== oldFp)
  console.log('')
}

async function stageSenderImport() {
  console.log('Stage 7: Sender-compatible import')
  const { publicB64, privateB64 } = generateVapidPair()
  const pubRaw = Buffer.from(publicB64, 'base64url')
  const privRaw = Buffer.from(privateB64, 'base64url')
  const x = pubRaw.slice(1, 33)
  const y = pubRaw.slice(33, 65)
  const b64 = (bytes) => Buffer.from(bytes).toString('base64url')
  const exported = {
    publicKey: { kty: 'EC', crv: 'P-256', x: b64(x), y: b64(y), ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', x: b64(x), y: b64(y), d: b64(privRaw) },
  }
  await crypto.subtle.importKey('jwk', exported.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
  await crypto.subtle.importKey('jwk', exported.privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  assert('webcrypto public import valid', true)
  assert('webcrypto private import valid', true)
  console.log('')
}

function main() {
  console.log('Production VAPID rotation verification\n')
  stageScriptSafety()
  stageCryptography()
  stageSecureBackup()
  stageGitAndConfig()
  stageFrontendRotationFlow()
  stageFingerprints()
  return stageSenderImport()
}

main()
  .then(() => {
    console.log(`Production VAPID rotation verification completed (${testsPassed}/${testsRun} tests, exit 0)\n`)
  })
  .catch((err) => {
    console.error(`FAILED: ${err.message}`)
    process.exit(1)
  })
