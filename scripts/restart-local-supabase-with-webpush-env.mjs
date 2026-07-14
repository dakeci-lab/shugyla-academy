#!/usr/bin/env node
/**
 * Restart local Supabase with Web Push Edge env loaded (preserves DB volume).
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const ENV_FILE = path.join(ROOT, 'supabase/functions/.env')

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

function parseEnv(content) {
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return env
}

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!existsSync(ENV_FILE)) {
  fail('Missing supabase/functions/.env — run npm run webpush:local:prepare-edge-env first')
}

const edgeEnv = parseEnv(readFileSync(ENV_FILE, 'utf8'))
console.log('Restarting local Supabase with Web Push Edge env (DB preserved)...')
run('npx', ['supabase', 'stop'], edgeEnv)
run('npx', ['supabase', 'start'], edgeEnv)
console.log('Local Supabase restarted with Web Push Edge env')
