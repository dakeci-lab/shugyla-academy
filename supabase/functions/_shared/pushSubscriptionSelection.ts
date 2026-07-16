import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getCurrentServerVapidFingerprint,
  isCurrentVapidFingerprint,
} from './vapidFingerprint.ts'

export type PushSubscriptionRecord = {
  id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
  failure_count?: number | null
  vapid_key_fingerprint?: string | null
  employee_id?: number
  auth_user_id?: string | null
  device_id?: string
}

const SUBSCRIPTION_SELECT =
  'id, employee_id, auth_user_id, endpoint, p256dh_key, auth_key, failure_count, vapid_key_fingerprint, device_id'

export async function loadActiveGrantedPushSubscriptions(
  serviceClient: SupabaseClient
): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await serviceClient
    .from('notification_push_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('is_active', true)
    .eq('permission_status', 'granted')

  if (error) throw new Error('subscription_load_error')
  return (data ?? []) as PushSubscriptionRecord[]
}

export function splitSubscriptionsByCurrentVapid(
  subscriptions: PushSubscriptionRecord[],
  currentFingerprint: string | null
): { current: PushSubscriptionRecord[]; outdated: PushSubscriptionRecord[] } {
  const current: PushSubscriptionRecord[] = []
  const outdated: PushSubscriptionRecord[] = []

  for (const subscription of subscriptions) {
    if (isCurrentVapidFingerprint(subscription.vapid_key_fingerprint, currentFingerprint)) {
      current.push(subscription)
    } else {
      outdated.push(subscription)
    }
  }

  return { current, outdated }
}

export async function loadCurrentVapidPushSubscriptions(
  serviceClient: SupabaseClient
): Promise<{
  currentFingerprint: string | null
  allActive: PushSubscriptionRecord[]
  current: PushSubscriptionRecord[]
  outdated: PushSubscriptionRecord[]
}> {
  const [currentFingerprint, allActive] = await Promise.all([
    getCurrentServerVapidFingerprint(),
    loadActiveGrantedPushSubscriptions(serviceClient),
  ])

  const { current, outdated } = splitSubscriptionsByCurrentVapid(allActive, currentFingerprint)

  return {
    currentFingerprint,
    allActive,
    current,
    outdated,
  }
}
