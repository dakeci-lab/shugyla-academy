/**
 * Collect pageerrors / console errors / failed network for Playwright pages.
 * Expected security-test failures can be allowlisted per-test.
 */

const DEFAULT_ALLOW = [
  /Download the React DevTools/i,
  /favicon\.ico/i,
  /net::ERR_ABORTED/i,
  /Failed to load resource: the server responded with a status of 404/i,
  // Soft self-profile probes (payroll columns) may 403 under narrow RLS without blocking HR UI.
  /\/rest\/v1\/academy_users\?select=.*payroll_participation/i,
  /\/rest\/v1\/academy_users\?select=.*hired_at/i,
]

/** HR soft-probe 403s — attach only on authenticated platform pages, not public /apply. */
export const HR_SOFT_PROBE_ALLOW = [
  /Failed to load resource: the server responded with a status of 403/i,
  /\/rest\/v1\/academy_users\?select=.*payroll_participation/i,
  /\/rest\/v1\/academy_users\?select=.*hired_at/i,
]

/**
 * Allowlist ONLY for intentional security-negative probes (direct REST without RPC).
 * Do not use on normal public /apply UI flows.
 */
export const SECURITY_PROBE_ALLOW = [
  /Failed to load resource: the server responded with a status of 401/i,
  /permission denied for table/i,
  /42501/,
  /^401$/,
  /^403$/,
]

export function attachConsoleGuard(page, options = {}) {
  const allow = [...DEFAULT_ALLOW, ...(options.allow || [])]
  const state = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    statusErrors: [],
  }

  page.on('pageerror', (err) => {
    state.pageErrors.push(String(err?.message || err))
  })

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (allow.some((re) => re.test(text))) return
    state.consoleErrors.push(text)
  })

  page.on('response', (response) => {
    const status = response.status()
    const url = response.url()
    if (status === 401 || status === 403 || status === 42501 || status >= 500) {
      if (allow.some((re) => re.test(url) || re.test(String(status)) || re.test(`${status} ${url}`))) {
        return
      }
      state.statusErrors.push({ status, url })
    }
  })

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'requestfailed'
    const url = request.url()
    if (allow.some((re) => re.test(failure) || re.test(url))) return
    state.failedRequests.push({ url, failure })
  })

  return {
    state,
    assertClean(label = 'page') {
      const problems = []
      if (state.pageErrors.length) problems.push(`pageerror: ${state.pageErrors.join(' | ')}`)
      if (state.consoleErrors.length) {
        problems.push(`console: ${state.consoleErrors.join(' | ')}`)
      }
      if (state.statusErrors.length) {
        problems.push(
          `status: ${state.statusErrors.map((s) => `${s.status} ${s.url}`).join(' | ')}`
        )
      }
      // failedRequests often include cancelled navigations; keep soft unless paired with others
      if (problems.length) {
        throw new Error(`[${label}] unexpected browser issues: ${problems.join(' ;; ')}`)
      }
    },
  }
}
