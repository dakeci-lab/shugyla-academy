import type { SupabaseClient } from '@supabase/supabase-js'

export const TEST_SEND_PERMIT_ISSUE_PERMISSION = 'roles.assign_permissions'
export const TEST_SEND_PERMIT_TTL_SECONDS = 300

export type PermitConsumeStatus =
  | 'consumed'
  | 'permit_not_found'
  | 'permit_invalid'
  | 'permit_expired'
  | 'permit_revoked'
  | 'permit_already_used'
  | 'permit_already_used_same_request'

export type IssuedTestSendPermit = {
  id: string
  expires_at: string
}

export async function issueTestSendPermit(
  serviceClient: SupabaseClient,
  employeeId: number,
  authUserId: string,
  deviceId: string
): Promise<{ permit: IssuedTestSendPermit | null; error: string | null }> {
  const { data, error } = await serviceClient.rpc('issue_notification_test_send_permit', {
    p_employee_id: employeeId,
    p_auth_user_id: authUserId,
    p_device_id: deviceId,
  })

  if (error) {
    return { permit: null, error: error.message }
  }

  const row = data as { id?: string; expires_at?: string } | null
  if (!row?.id || !row?.expires_at) {
    return { permit: null, error: 'invalid_issue_response' }
  }

  return {
    permit: {
      id: row.id,
      expires_at: row.expires_at,
    },
    error: null,
  }
}

export async function consumeTestSendPermit(
  serviceClient: SupabaseClient,
  permitId: string,
  employeeId: number,
  authUserId: string,
  deviceId: string,
  requestId: string
): Promise<PermitConsumeStatus> {
  const { data, error } = await serviceClient.rpc('consume_notification_test_send_permit', {
    p_permit_id: permitId,
    p_employee_id: employeeId,
    p_auth_user_id: authUserId,
    p_device_id: deviceId,
    p_request_id: requestId,
  })

  if (error) {
    return 'permit_not_found'
  }

  const status = typeof data === 'string' ? data : String(data ?? '')
  if (
    status === 'consumed' ||
    status === 'permit_not_found' ||
    status === 'permit_invalid' ||
    status === 'permit_expired' ||
    status === 'permit_revoked' ||
    status === 'permit_already_used' ||
    status === 'permit_already_used_same_request'
  ) {
    return status
  }

  return 'permit_not_found'
}

export type PermitStatusSnapshot = {
  valid: boolean
  expired: boolean
  consumed: boolean
  revoked: boolean
  expires_at: string | null
}

export async function loadPermitStatusForCaller(
  serviceClient: SupabaseClient,
  permitId: string,
  employeeId: number,
  authUserId: string,
  deviceId: string
): Promise<PermitStatusSnapshot | 'permit_invalid'> {
  const { data, error } = await serviceClient
    .from('notification_test_send_permits')
    .select('expires_at, consumed_at, revoked_at, employee_id, auth_user_id, device_id')
    .eq('id', permitId)
    .maybeSingle()

  if (error || !data) {
    return 'permit_invalid'
  }

  if (
    data.employee_id !== employeeId ||
    data.auth_user_id !== authUserId ||
    data.device_id !== deviceId
  ) {
    return 'permit_invalid'
  }

  const now = Date.now()
  const expiresAtMs = Date.parse(String(data.expires_at))
  const expired = Number.isFinite(expiresAtMs) ? expiresAtMs <= now : true
  const consumed = data.consumed_at != null
  const revoked = data.revoked_at != null

  return {
    valid: !expired && !consumed && !revoked,
    expired,
    consumed,
    revoked,
    expires_at: data.expires_at ?? null,
  }
}
