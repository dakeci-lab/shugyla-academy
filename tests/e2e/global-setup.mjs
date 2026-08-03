import { setupE2eFixture, loadState, saveState, createTestRunId } from './helpers/fixture.mjs'
import { resolveServiceRoleKey, getSupabaseUrl, getBaseUrl } from './helpers/env.mjs'

export default async function globalSetup() {
  // Force production project URL/keys via helpers (ignore local Vite localhost env).
  getSupabaseUrl()
  resolveServiceRoleKey()

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
      positionId: process.env.E2E_POSITION_ID || null,
      positionName: process.env.E2E_POSITION_NAME || null,
      createdAt: new Date().toISOString(),
    })
  } else {
    await setupE2eFixture({
      runId: process.env.E2E_RUN_ID?.trim() || undefined,
      password: process.env.E2E_HR_PASSWORD?.trim() || undefined,
    })
  }

  const state = loadState()
  if (!state?.login || !state?.password) {
    throw new Error('E2E global setup failed: missing HR credentials in run state')
  }

  process.env.E2E_HR_LOGIN = state.login
  process.env.E2E_HR_PASSWORD = state.password
  process.env.E2E_RUN_ID = state.runId
  process.env.E2E_BASE_URL = state.baseUrl || getBaseUrl()

  console.log(`E2E setup ready runId=${state.runId} base=${process.env.E2E_BASE_URL}`)
}
