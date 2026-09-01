-- Daily 07:00 (Aqtobe, UTC+5 = 02:00 UTC) automatic UMAG procurement sync.
-- Mirrors the existing time-tracker scheduler wiring 1:1 (same HMAC scheme,
-- same vault secret lookup, same net.http_post shape) — see
-- public.invoke_time_tracker_notification_scheduler() for the precedent.
--
-- Independent of the manual «Синхронизировать» button in Планирование:
-- both paths call the same umag-procurement Edge Function / sync logic,
-- just through different authorization branches (user JWT vs HMAC).
--
-- Requires (applied out-of-band, not in this migration — see
-- docs/procurement/planning-daily-auto-sync.md):
--   1. vault secret 'procurement_sync_scheduler_hmac_secret' (32+ random bytes, base64url)
--   2. umag-procurement Edge Function secrets:
--        PROCUREMENT_SYNC_SCHEDULER_ENABLED=true
--        PROCUREMENT_SYNC_SCHEDULER_SECRET_CURRENT=<same value as the vault secret>
-- Until both exist, the cron job fires on schedule but the Edge Function
-- responds 503 scheduler_disabled — safe no-op, no partial/broken syncs.

create or replace function public.invoke_procurement_sync_scheduler()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'pg_catalog'
as $function$
declare
  v_ts text;
  v_body constant text := '{}';
  v_body_hash constant text := '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
  v_secret_b64url text;
  v_secret_bytes bytea;
  v_canonical text;
  v_signature text;
  v_url text;
  v_anon text;
  v_request_id bigint;
  v_b64 text;
begin
  v_ts := floor(extract(epoch from clock_timestamp()))::bigint::text;

  select decrypted_secret into v_secret_b64url
  from vault.decrypted_secrets
  where name = 'procurement_sync_scheduler_hmac_secret'
  limit 1;
  if v_secret_b64url is null then
    raise exception 'scheduler_secret_missing';
  end if;

  v_b64 := translate(v_secret_b64url, '-_', '+/');
  v_b64 := v_b64 || repeat('=', (4 - length(v_b64) % 4) % 4);
  v_secret_bytes := decode(v_b64, 'base64');
  if length(v_secret_bytes) < 32 then
    raise exception 'scheduler_secret_invalid';
  end if;

  v_canonical := v_ts || E'\n' || 'POST' || E'\n' || v_body_hash;
  v_signature := 'v1=' || encode(hmac(v_canonical::bytea, v_secret_bytes, 'sha256'), 'hex');

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'shugyla_supabase_functions_base_url'
  limit 1;

  select decrypted_secret into v_anon
  from vault.decrypted_secrets
  where name = 'shugyla_supabase_anon_key'
  limit 1;

  if v_url is null or v_anon is null then
    raise exception 'scheduler_cron_config_missing';
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/umag-procurement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon,
      'x-shugyla-scheduler-timestamp', v_ts,
      'x-shugyla-scheduler-signature', v_signature
    ),
    body := v_body::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$function$;

select cron.schedule(
  'procurement-sync-scheduler-daily-0700-aqtobe',
  '0 2 * * *',
  $$select public.invoke_procurement_sync_scheduler();$$
);
