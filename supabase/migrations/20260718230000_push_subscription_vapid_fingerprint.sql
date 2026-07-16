-- Track VAPID public key fingerprint on push subscriptions for rotation-safe delivery.

alter table public.notification_push_subscriptions
  add column if not exists vapid_key_fingerprint text;

create index if not exists idx_notification_push_subscriptions_vapid_fingerprint
  on public.notification_push_subscriptions (vapid_key_fingerprint)
  where is_active = true and permission_status = 'granted';

comment on column public.notification_push_subscriptions.vapid_key_fingerprint is
  'SHA-256 fingerprint (first 16 hex chars) of decoded VAPID public key used when subscription was registered.';
