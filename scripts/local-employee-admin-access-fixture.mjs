#!/usr/bin/env node
/**
 * Local fixture helper for employee admin access verification.
 *
 * Usage:
 *   node scripts/local-employee-admin-access-fixture.mjs --setup
 *   node scripts/local-employee-admin-access-fixture.mjs --cleanup
 */

import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const args = process.argv.slice(2)

if (args.includes('--setup') || args.includes('--cleanup')) {
  const mode = args.includes('--setup') ? '--setup' : '--cleanup'
  const result = spawnSync('node', ['scripts/verify-employee-admin-access.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      EMP_ADMIN_FIXTURE_MODE: mode,
    },
  })
  process.exit(result.status ?? 1)
}

console.error(`Usage:
  node scripts/local-employee-admin-access-fixture.mjs --setup
  node scripts/local-employee-admin-access-fixture.mjs --cleanup

For full verification run:
  npm run supabase:local:verify-employee-admin-access`)

process.exit(1)
