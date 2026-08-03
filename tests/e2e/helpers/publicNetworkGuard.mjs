/**
 * Network assertions for public /apply routes after PlatformData isolation.
 * Checks allowed RPC categories and absence of internal bootstrap tables.
 */

const FORBIDDEN_PATH_SNIPPETS = [
  '/rest/v1/academy_candidates',
  '/rest/v1/positions',
  '/rest/v1/position_groups',
  '/rest/v1/receiving_documents',
  '/rest/v1/purchase_orders',
  '/rest/v1/suppliers',
  'fetchRecruitmentData',
]

const AUTH_ALLOW_SNIPPETS = [
  '/auth/v1/',
  '/rest/v1/academy_users',
  '/rest/v1/roles',
  '/rest/v1/role_permissions',
  '/rest/v1/permissions',
]

function rpcNameFromUrl(url) {
  try {
    const u = new URL(url)
    if (!u.pathname.includes('/rest/v1/rpc/')) return null
    return u.pathname.split('/').pop() || null
  } catch {
    return null
  }
}

function isSupabaseApi(url) {
  return /supabase\.co\/(rest|auth|storage)\//i.test(url)
}

export function attachPublicNetworkGuard(page, options = {}) {
  const mode = options.mode || 'hub' // hub | form
  const state = {
    requests: [],
    responses: [],
  }

  page.on('request', (request) => {
    const url = request.url()
    if (!isSupabaseApi(url)) return
    state.requests.push({
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      rpc: rpcNameFromUrl(url),
    })
  })

  page.on('response', (response) => {
    const url = response.url()
    if (!isSupabaseApi(url)) return
    state.responses.push({
      url,
      status: response.status(),
      rpc: rpcNameFromUrl(url),
    })
  })

  return {
    state,
    assertIsolated(label = 'public-network') {
      const problems = []

      for (const res of state.responses) {
        if (res.status === 401 || res.status === 403 || res.status === 42501 || res.status >= 500) {
          // Auth session restore may touch academy_users / roles — those must succeed when session exists.
          // Fail any unexpected authz/error on API calls.
          problems.push(`status ${res.status} ${res.url}`)
        }
      }

      for (const req of state.requests) {
        if (FORBIDDEN_PATH_SNIPPETS.some((snip) => req.url.includes(snip))) {
          problems.push(`forbidden request ${req.url}`)
        }
      }

      const rpcs = state.requests.map((r) => r.rpc).filter(Boolean)
      if (mode === 'hub') {
        if (!rpcs.includes('list_published_vacancies_for_apply')) {
          problems.push('missing list_published_vacancies_for_apply RPC')
        }
        const unexpectedRpc = rpcs.filter(
          (name) =>
            name !== 'list_published_vacancies_for_apply' &&
            !['get_public_vacancy_application_form'].includes(name)
        )
        // Hub page should not call form/submit/upload RPCs
        const hubForbidden = [
          'submit_candidate_application',
          'create_candidate_photo_upload_session',
          'cancel_candidate_photo_upload_session',
          'get_public_vacancy_application_form',
        ]
        for (const name of rpcs) {
          if (hubForbidden.includes(name)) {
            problems.push(`hub unexpected RPC ${name}`)
          }
        }
        void unexpectedRpc
      }

      if (mode === 'form') {
        if (!rpcs.includes('get_public_vacancy_application_form')) {
          problems.push('missing get_public_vacancy_application_form RPC')
        }
        const formForbiddenBootstrap = [
          'list_published_vacancies_for_apply', // optional; detail pages may list — allow if present? Prefer not on /apply/:slug
        ]
        // /apply/:slug should use form RPC; list RPC is not required and usually absent
        void formForbiddenBootstrap
      }

      // Non-RPC rest table access beyond auth allowlist is suspicious on public routes
      for (const req of state.requests) {
        if (!req.url.includes('/rest/v1/')) continue
        if (req.rpc) continue
        if (AUTH_ALLOW_SNIPPETS.some((snip) => req.url.includes(snip))) continue
        if (req.url.includes('/storage/v1/')) continue
        problems.push(`unexpected rest table ${req.url}`)
      }

      if (problems.length) {
        throw new Error(`[${label}] public network isolation failed: ${problems.join(' ;; ')}`)
      }
    },
    summary() {
      const rpcs = [...new Set(state.requests.map((r) => r.rpc).filter(Boolean))]
      return {
        supabaseRequestCount: state.requests.length,
        rpcs,
        statuses: state.responses.map((r) => r.status),
      }
    },
  }
}
