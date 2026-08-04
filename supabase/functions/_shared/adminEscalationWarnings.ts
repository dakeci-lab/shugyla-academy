import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentServerVapidFingerprint } from './vapidFingerprint.ts'
import type { EscalationSettings } from './adminEscalationLogic.ts'

export type EscalationWarning = {
  code: string
  severity: 'info' | 'warning'
  message: string
}

const ADMIN_ROLE_CODES = ['admin', 'administrator', 'floor_admin']

export async function buildAdminEscalationWarnings(
  serviceClient: SupabaseClient,
  settings: EscalationSettings | null,
  frontendFingerprint: string | null = null
): Promise<EscalationWarning[]> {
  const warnings: EscalationWarning[] = []
  const effective = settings

  if (!effective || effective.is_enabled === false) {
    warnings.push({
      code: 'escalations_disabled',
      severity: 'warning',
      message: 'Административные эскалации тайм-трекера выключены.',
    })
  }

  if (
    effective &&
    effective.recipient_mode === 'duty_with_fallback' &&
    (!effective.fallback_employee_ids || effective.fallback_employee_ids.length === 0)
  ) {
    warnings.push({
      code: 'fallback_not_configured',
      severity: 'info',
      message:
        'Fallback-получатели не настроены. При отсутствии дежурного будут использованы активные администраторы по роли/permission.',
    })
  }

  const { data: activeViolations } = await serviceClient
    .from('time_tracker_violations')
    .select('id, notified_admin_ids, web_push_outcome')
    .eq('status', 'active')
    .limit(100)

  const activeUnnotified = (activeViolations ?? []).filter((row) => {
    const admins = Array.isArray(row.notified_admin_ids) ? row.notified_admin_ids : []
    const outcome = row.web_push_outcome
    return (
      admins.length === 0 ||
      outcome == null ||
      outcome === 'no_current_subscription' ||
      outcome === 'failed'
    )
  }).length

  if (activeUnnotified > 0) {
    warnings.push({
      code: 'active_violations_without_admin_push',
      severity: 'warning',
      message: `Есть активные нарушения без успешного push администратору (${activeUnnotified}).`,
    })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: escCreated } = await serviceClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .in('event_code', ['admin_clock_in_escalation', 'admin_clock_out_escalation'])
    .gte('created_at', since)

  const { data: escNotifications } = await serviceClient
    .from('notifications')
    .select('id')
    .in('event_code', ['admin_clock_in_escalation', 'admin_clock_out_escalation'])
    .gte('created_at', since)
    .limit(200)

  const escIds = (escNotifications ?? []).map((row) => row.id)
  let acceptedEsc = 0
  if (escIds.length) {
    const { count } = await serviceClient
      .from('notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .in('notification_id', escIds)
      .eq('status', 'accepted')
    acceptedEsc = count ?? 0
  }

  if ((escCreated ?? 0) > 0 && acceptedEsc === 0) {
    warnings.push({
      code: 'escalation_zero_accepted',
      severity: 'warning',
      message:
        'Scheduler создавал административные эскалации за 24ч, но accepted deliveries = 0.',
    })
  }

  const { data: roles } = await serviceClient
    .from('roles')
    .select('id')
    .in('code', ADMIN_ROLE_CODES)
  const roleIds = (roles ?? []).map((row) => row.id)
  if (roleIds.length) {
    const { data: admins } = await serviceClient
      .from('academy_users')
      .select('id, full_name')
      .eq('status', 'active')
      .in('role_id', roleIds)

    const adminIds = (admins ?? []).map((row) => row.id)
    if (adminIds.length) {
      const fingerprint = await getCurrentServerVapidFingerprint()
      const { data: subs } = fingerprint
        ? await serviceClient
            .from('notification_push_subscriptions')
            .select('employee_id')
            .in('employee_id', adminIds)
            .eq('is_active', true)
            .eq('permission_status', 'granted')
            .eq('vapid_key_fingerprint', fingerprint)
        : { data: [] }

      const withSub = new Set((subs ?? []).map((row) => row.employee_id))
      const without = (admins ?? []).filter((row) => !withSub.has(row.id))
      if (without.length > 0) {
        warnings.push({
          code: 'duty_admin_no_current_subscription',
          severity: 'warning',
          message: `У ${without.length} активных администраторов нет current subscription.`,
        })
      }
    }
  }

  const backendFingerprint = await getCurrentServerVapidFingerprint()
  if (
    frontendFingerprint &&
    backendFingerprint &&
    frontendFingerprint !== backendFingerprint
  ) {
    warnings.push({
      code: 'vapid_fingerprint_mismatch',
      severity: 'warning',
      message: 'Frontend/backend VAPID fingerprint не совпадают.',
    })
  }

  const { data: lastAuto } = await serviceClient
    .from('notifications')
    .select('created_at')
    .eq('module_code', 'time_tracker')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastAuto?.created_at) {
    const ageMs = Date.now() - new Date(lastAuto.created_at).getTime()
    if (ageMs > 20 * 60 * 1000) {
      warnings.push({
        code: 'scheduler_stale',
        severity: 'info',
        message:
          'Последнее time-tracker уведомление старше 20 минут — проверьте интервал scheduler.',
      })
    }
  }

  return warnings
}
