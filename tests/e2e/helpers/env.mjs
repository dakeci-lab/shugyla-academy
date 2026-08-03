/**
 * Load production E2E secrets without printing values.
 * Prefer explicit env; otherwise fetch service_role via linked Supabase CLI.
 */
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

export const PRODUCTION_REF = 'cxadzerxndlscwvdaymk'
export const DEFAULT_BASE_URL = 'https://dakeci-lab.github.io/shugyla-academy'

function mask(value) {
  if (!value) return ''
  return `[redacted len=${String(value).length}]`
}

export function getBaseUrl() {
  return (process.env.E2E_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function isLocalUrl(url) {
  return /localhost|127\.0\.0\.1/i.test(String(url || ''))
}

export function getSupabaseUrl() {
  const suite = process.env.E2E_SUITE || 'mutating'
  const allowNonProd =
    process.env.E2E_ALLOW_NON_PROD === '1' || suite === 'mutating'
  const candidates = [
    process.env.E2E_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    `https://${PRODUCTION_REF}.supabase.co`,
  ].filter(Boolean)
  let url =
    (allowNonProd && process.env.E2E_SUPABASE_URL?.trim()) ||
    candidates.find((u) => u.includes(PRODUCTION_REF)) ||
    candidates[0]
  if (isLocalUrl(url)) {
    url = `https://${PRODUCTION_REF}.supabase.co`
  }
  if (!url.includes(PRODUCTION_REF) && !allowNonProd) {
    throw new Error(`E2E smoke must target production project ${PRODUCTION_REF}`)
  }
  process.env.SUPABASE_URL = url.replace(/\/$/, '')
  process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL
  return process.env.SUPABASE_URL
}

function parseApiKeysOutput(stdout) {
  const start = stdout.indexOf('[')
  const end = stdout.lastIndexOf(']')
  if (start < 0 || end < start) {
    throw new Error('Could not parse supabase api-keys JSON')
  }
  return JSON.parse(stdout.slice(start, end + 1))
}

function fetchProductionApiKeys() {
  const result = spawnSync(
    'npx',
    ['supabase@2.111.0', 'projects', 'api-keys', '--project-ref', PRODUCTION_REF, '-o', 'json'],
    {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_INTERNAL_NO_TELEMETRY: '1' },
    }
  )
  if (result.status !== 0) {
    throw new Error('Failed to resolve API keys via supabase CLI')
  }
  return parseApiKeysOutput(result.stdout || '')
}

export function resolveServiceRoleKey() {
  if (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.E2E_SUPABASE_SERVICE_ROLE_KEY.trim()
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  }

  const keys = fetchProductionApiKeys()
  const service = keys.find((k) => k.id === 'service_role' || k.name === 'service_role')
  if (!service?.api_key) {
    throw new Error('service_role key not found in supabase api-keys response')
  }
  process.env.SUPABASE_SERVICE_ROLE_KEY = service.api_key
  const anon = keys.find((k) => k.id === 'anon' || k.name === 'anon')
  if (anon?.api_key) {
    // Prefer production anon over local .env.local anon.
    process.env.VITE_SUPABASE_ANON_KEY = anon.api_key
    process.env.SUPABASE_ANON_KEY = anon.api_key
  }
  return service.api_key
}

export function resolveAnonKey() {
  if (process.env.E2E_SUPABASE_ANON_KEY?.trim()) {
    return process.env.E2E_SUPABASE_ANON_KEY.trim()
  }
  if (process.env.SUPABASE_ANON_KEY?.trim()) {
    return process.env.SUPABASE_ANON_KEY.trim()
  }
  if (
    process.env.VITE_SUPABASE_ANON_KEY?.trim() &&
    String(process.env.SUPABASE_URL || '').includes(PRODUCTION_REF)
  ) {
    return process.env.VITE_SUPABASE_ANON_KEY.trim()
  }
  // Resolve production anon for smoke (local .env may point at localhost).
  const keys = fetchProductionApiKeys()
  const anon = keys.find((k) => k.id === 'anon' || k.name === 'anon')
  if (!anon?.api_key) throw new Error('anon key not found')
  process.env.VITE_SUPABASE_ANON_KEY = anon.api_key
  process.env.SUPABASE_ANON_KEY = anon.api_key
  return anon.api_key
}

export function createAdminClient() {
  const url = getSupabaseUrl()
  const key = resolveServiceRoleKey()
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createAnonClient() {
  const url = getSupabaseUrl()
  const anon = resolveAnonKey()
  return createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function assertNoSecretLeak(text) {
  const value = String(text || '')
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (service && value.includes(service)) {
    throw new Error('Secret leak detected in output')
  }
  if (/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) {
    // Allow only if it is clearly the public anon JWT already embedded in frontend bundles —
    // reject service_role payloads by role claim when present.
    if (value.includes('"role":"service_role"') || value.includes('role":"service_role')) {
      throw new Error('service_role JWT leak detected')
    }
  }
  return mask(value)
}
