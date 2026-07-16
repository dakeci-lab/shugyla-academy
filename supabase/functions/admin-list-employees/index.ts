import '@supabase/functions-js/edge-runtime.d.ts'
import { authorizeEmployeeAdmin, adminErrorResponse } from '../_shared/employeeAuthorization.ts'
import {
  ALLOWED_STATUSES,
  SAFE_EMPLOYEE_SELECT,
  SORTABLE_FIELDS,
  mapSafeEmployee,
  sanitizeSearchTerm,
  type DbEmployeeRow,
  type SortableField,
} from '../_shared/employeeFields.ts'
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts'

const PERMISSION_VIEW = 'employees.view'
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const ALLOWED_BODY_KEYS = new Set([
  'page',
  'page_size',
  'search',
  'status',
  'role_id',
  'sort_by',
  'sort_direction',
])

const DEACTIVATED_STATUSES = ['inactive', 'deactivated', 'terminated']

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function parseBodyNumbers(payload: Record<string, unknown>) {
  const pageRaw = payload.page ?? DEFAULT_PAGE
  const pageSizeRaw = payload.page_size ?? DEFAULT_PAGE_SIZE

  const page = typeof pageRaw === 'number' ? pageRaw : Number(pageRaw)
  const pageSize = typeof pageSizeRaw === 'number' ? pageSizeRaw : Number(pageSizeRaw)

  return { page, pageSize }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  if (req.method !== 'POST') {
    return adminErrorResponse('method_not_allowed', 405)
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return adminErrorResponse('malformed_json', 400)
  }

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return adminErrorResponse('forbidden_field', 422)
    }
  }

  const { page, pageSize } = parseBodyNumbers(payload)
  if (!isPositiveInt(page)) {
    return adminErrorResponse('invalid_pagination', 422)
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return adminErrorResponse('invalid_pagination', 422)
  }

  const sortByRaw = typeof payload.sort_by === 'string' ? payload.sort_by.trim() : 'full_name'
  const sortBy = (sortByRaw || 'full_name') as SortableField
  if (!SORTABLE_FIELDS.includes(sortBy)) {
    return adminErrorResponse('invalid_sort', 422)
  }

  const sortDirectionRaw =
    typeof payload.sort_direction === 'string' ? payload.sort_direction.trim().toLowerCase() : 'asc'
  if (sortDirectionRaw !== 'asc' && sortDirectionRaw !== 'desc') {
    return adminErrorResponse('invalid_sort', 422)
  }
  const ascending = sortDirectionRaw === 'asc'

  let statusFilter: string | null = null
  if (payload.status != null) {
    if (typeof payload.status !== 'string') {
      return adminErrorResponse('invalid_status', 422)
    }
    const status = payload.status.trim()
    if (status === 'all') {
      statusFilter = null
    } else if (status === 'deactivated') {
      statusFilter = 'deactivated'
    } else if (!ALLOWED_STATUSES.has(status)) {
      return adminErrorResponse('invalid_status', 422)
    } else {
      statusFilter = status
    }
  }

  let roleIdFilter: string | null = null
  if (payload.role_id != null) {
    if (typeof payload.role_id !== 'string' || !payload.role_id.trim()) {
      return adminErrorResponse('validation_error', 422)
    }
    roleIdFilter = payload.role_id.trim()
  }

  const authResult = await authorizeEmployeeAdmin(req, PERMISSION_VIEW)
  if (authResult instanceof Response) return authResult

  const { serviceClient } = authResult

  let query = serviceClient
    .from('academy_users')
    .select(SAFE_EMPLOYEE_SELECT, { count: 'exact' })
    .neq('role', 'admin')

  if (statusFilter === 'deactivated') {
    query = query.in('status', DEACTIVATED_STATUSES)
  } else if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  if (roleIdFilter) {
    query = query.eq('role_id', roleIdFilter)
  }

  const searchRaw = typeof payload.search === 'string' ? payload.search : ''
  const search = sanitizeSearchTerm(searchRaw)
  if (search) {
    const pattern = `%${search}%`
    query = query.or(
      [
        `full_name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `login.ilike.${pattern}`,
        `position.ilike.${pattern}`,
      ].join(',')
    )
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query
    .order(sortBy, { ascending })
    .order('id', { ascending: true })
    .range(from, to)

  if (error) {
    console.error('admin_list_employees_failed', {
      requestId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    return adminErrorResponse('internal_error', 500)
  }

  const total = count ?? 0
  const employees = []
  for (const row of data ?? []) {
    try {
      employees.push(mapSafeEmployee(row as DbEmployeeRow))
    } catch (mapError) {
      console.error('admin_list_employees_map_failed', {
        requestId,
        employeeId: (row as DbEmployeeRow)?.id,
        category: mapError instanceof Error ? mapError.message : 'unknown',
      })
    }
  }

  return jsonResponse({
    ok: true,
    employees,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  })
})
