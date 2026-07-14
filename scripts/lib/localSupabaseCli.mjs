import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..', '..')

export function runSupabaseCli(args, options = {}) {
  const result = spawnSync('npm', ['exec', '--yes', 'supabase@2.109.1', '--', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })

  if (result.error) {
    throw new Error(`supabase CLI failed: ${result.error.message}`)
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`supabase CLI exited with code ${result.status}`)
  }

  return result
}

export function getLocalSupabaseStatus() {
  const result = runSupabaseCli(['status', '-o', 'json'], { capture: true })
  const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Could not parse supabase status JSON')
  }
  return JSON.parse(jsonMatch[0])
}
