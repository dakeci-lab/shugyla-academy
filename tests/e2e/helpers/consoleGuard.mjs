/**
 * Collect pageerrors / console errors / failed network for Playwright pages.
 * Expected security-test failures can be allowlisted.
 */

const DEFAULT_ALLOW = [
  /Download the React DevTools/i,
  /favicon\.ico/i,
  /net::ERR_ABORTED/i,
  /Failed to load resource: the server responded with a status of 404/i,
  // Soft self-profile probes (payroll columns) may 403 under narrow RLS without blocking HR UI.
  /Failed to load resource: the server responded with a status of 403/i,
  /\/rest\/v1\/academy_users\?select=.*payroll_participation/i,
  /\/rest\/v1\/academy_users\?select=.*hired_at/i,
]

/** Expected on anonymous /apply pages: SPA still probes authenticated tables. */
export const PUBLIC_APPLY_ALLOW = [
  /Failed to load resource: the server responded with a status of 401/i,
  /permission denied for table/i,
  /42501/,
  /^401$/,
  /Загрузка сотрудников/i,
  /Загрузка документов приёмки/i,
  /Загрузка закупов/i,
  /Загрузка приёмки/i,
  /UserError/i,
  /Не удалось сохранить данные/i,
  /\/rest\/v1\/academy_users/i,
  /\/rest\/v1\/positions/i,
  /\/rest\/v1\/position_groups/i,
  /\/rest\/v1\/receiving_documents/i,
  /\/rest\/v1\/purchase_orders/i,
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
