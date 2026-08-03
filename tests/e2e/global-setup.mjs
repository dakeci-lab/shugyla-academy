import { setupE2eFixture, loadState, saveState, createTestRunId } from './helpers/fixture.mjs'
import { resolveServiceRoleKey, getSupabaseUrl, getBaseUrl } from './helpers/env.mjs'

function assertSuiteAllowed() {
  const suite = process.env.E2E_SUITE || 'mutating'
  const base = getBaseUrl()
  const isProductionPages = /dakeci-lab\.github\.io\/shugyla-academy/i.test(base)
  if (suite === 'mutating' && isProductionPages && process.env.E2E_ALLOW_PRODUCTION_MUTATING !== '1') {
    throw new Error(
      [
        'Mutating recruitment E2E is blocked against production Pages.',
        'Use E2E_SUITE=smoke for production, or point E2E_BASE_URL/E2E_SUPABASE_* at staging.',
        'Override only with E2E_ALLOW_PRODUCTION_MUTATING=1 (not for routine CI).',
      ].join(' ')
    )
  }
  process.env.E2E_SUITE = suite
}

export default async function globalSetup() {
  assertSuiteAllowed()
  // Force production/staging project URL/keys via helpers (ignore local Vite localhost env).
  getSupabaseUrl()
  resolveServiceRoleKey()

  const suite = process.env.E2E_SUITE || 'mutating'

  if (process.env.E2E_REUSE_HR === '1') {
    const login = process.env.E2E_HR_LOGIN?.trim()
    const password = process.env.E2E_HR_PASSWORD?.trim()
    if (!login || !password) {
      throw new Error('E2E_REUSE_HR=1 requires E2E_HR_LOGIN and E2E_HR_PASSWORD')
    }
    const runId = process.env.E2E_RUN_ID?.trim() || createTestRunId()
    saveState({
      runId,
      titlePrefix: runId,
      login,
      password,
      reuseAccount: true,
      vacancyIds: [],
      candidateIds: [],
      baseUrl: getBaseUrl(),
      suite,
      positionId: process.env.E2E_POSITION_ID || null,
      positionName: process.env.E2E_POSITION_NAME || null,
      createdAt: new Date().toISOString(),
    })
  } else {
    await setupE2eFixture({
      runId: process.env.E2E_RUN_ID?.trim() || undefined,
      password: process.env.E2E_HR_PASSWORD?.trim() || undefined,
    })
    const state = loadState()
    if (state) {
      state.suite = suite
      saveState(state)
    }
  }

  const state = loadState()
  if (!state?.login || !state?.password) {
    throw new Error('E2E global setup failed: missing HR credentials in run state')
  }

  process.env.E2E_HR_LOGIN = state.login
  process.env.E2E_HR_PASSWORD = state.password
  process.env.E2E_RUN_ID = state.runId
  process.env.E2E_BASE_URL = state.baseUrl || getBaseUrl()

  console.log(
    `E2E setup ready suite=${suite} runId=${state.runId} base=${process.env.E2E_BASE_URL}`
  )
}
