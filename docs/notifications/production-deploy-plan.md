# Production Deploy Plan — Time Tracker Notifications

**Status:** planning document only. **Do not execute** any step in this document without explicit owner approval.

See also: [production-readiness.md](./production-readiness.md)

## 1. Pre-deploy backup / checklist

Before any production change:

- [ ] Confirm current production migration history (`supabase migration list --linked` — **owner approval required**)
- [ ] Full database backup (Supabase dashboard or `pg_dump`)
- [ ] Export current Edge Function versions and env var names (not values)
- [ ] Document current `notification_rules` state (`is_enabled` for all `time_tracker.rule.*`)
- [ ] Confirm no accidental production Cron jobs exist
- [ ] Verify local regression suite exit 0 on release branch
- [ ] Create Git checkpoint / tag before deploy

## 2. Production migration history check

**DO NOT RUN YET** without owner approval:

```bash
# Requires explicit owner approval and supabase link
supabase migration list --linked
```

Compare output against expected notification migrations (Section 3). Resolve duplicate `web_push_delivery_tracking` filenames before apply.

## 3. Notification migrations (apply in order)

Apply via approved migration workflow only:

1. `20260712163000_complete_flexible_rbac.sql`
2. `20260713194500_notification_system_foundation.sql`
3. `20260714120000_auth_first_login_foundation.sql`
4. `20260714130000_employee_provisioning_service_grants.sql`
5. `20260714140000_web_push_subscription_foundation.sql`
6. `20260714150000_web_push_delivery_tracking.sql` *(confirm canonical file)*
7. `20260714160000_time_tracker_dispatch_grants.sql`

Post-apply SQL check (**DO NOT RUN YET**):

```sql
SELECT code, is_enabled FROM public.notification_rules
WHERE code LIKE 'time_tracker.rule.%'
ORDER BY code;
-- Expected: 4 rows, all is_enabled = false
```

## 4. Edge Functions deploy order

| Order | Function | Production status |
|-------|----------|-------------------|
| 1 | `manage-push-subscription` | **Deploy** — required for browser subscriptions |
| 2 | `dispatch-time-tracker-notifications` | **Deploy with guards** — admin/manual endpoint; keep `TIME_TRACKER_DISPATCH_TEST_ENABLED` unset/false in production; real dispatch only via explicit future approval |
| 3 | `run-time-tracker-notification-scheduler` | **Deploy disabled** — HMAC scheduler; `TIME_TRACKER_SCHEDULER_ENABLED=false` on first deploy |
| 4 | `send-test-web-push` | **Do not deploy test flow by default** — omit or hard-disable (`WEB_PUSH_TEST_ENABLED=false`); not for production users |

**DO NOT RUN YET:**

```bash
supabase functions deploy manage-push-subscription
supabase functions deploy dispatch-time-tracker-notifications
supabase functions deploy run-time-tracker-notification-scheduler
# send-test-web-push — skip unless explicitly approved
```

## 5. Production secrets

Set in Supabase Edge Function secrets (never Git, never frontend):

| Secret | Initial value | Notes |
|--------|---------------|-------|
| `VAPID_PUBLIC_KEY` | Generate new production pair | Public; also expose to frontend build as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_KEY` | Generate new production pair | Edge only |
| `VAPID_SUBJECT` | `mailto:...` or `https://...` | Contact for push service |
| `TIME_TRACKER_SCHEDULER_SECRET_CURRENT` | Generate ≥32 random bytes | Base64url-encoded; see Section 6 |
| `TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS` | *(optional, empty on first deploy)* | Used during rotation only |
| `TIME_TRACKER_SCHEDULER_ENABLED` | `false` | Enable only after smoke test approval |
| `TIME_TRACKER_SCHEDULER_TEST_MODE` | `false` | Must remain false in production |

Also ensure Supabase-managed keys exist (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — platform-managed).

## 6. Scheduler secret generation and storage

**Generation (offline, owner-operated):**

```bash
# Example — run locally, copy output to secret manager only
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Requirements:

- Minimum 32 decoded bytes
- Store as base64url string in secret manager
- Never commit, never log, never paste into tickets/chat
- Fingerprint (SHA-256 first 16 hex) may be recorded for audit

**Storage locations (approved):**

- Supabase Vault / Edge secrets UI
- External secret manager (1Password, AWS Secrets Manager, etc.)

**Forbidden:**

- Git repository
- SQL migrations / seed files
- Frontend `src/` or `public/`
- Ordinary database tables
- Cron SQL bodies in plain text

## 7. Secret rotation

1. Generate `NEW_SECRET`
2. Set `TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS` = current `TIME_TRACKER_SCHEDULER_SECRET_CURRENT`
3. Set `TIME_TRACKER_SCHEDULER_SECRET_CURRENT` = `NEW_SECRET`
4. Deploy Edge Function config (no code change required)
5. Update Cron caller / external scheduler to sign with `NEW_SECRET`
6. Run signed smoke test (both secrets accepted during overlap)
7. After 24–48 h, remove `TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS`
8. Revoke old secret from all callers

HMAC scheme (must match exactly):

```
canonical = "<unix_seconds>\nPOST\n<sha256_hex_raw_body>"
signature = "v1=" + HMAC_SHA256(secret, canonical)
headers:
  x-shugyla-scheduler-timestamp: <unix_seconds>
  x-shugyla-scheduler-signature: v1=<hex>
body (raw bytes): {}
```

## 8. Cron creation (separate step, post-deploy approval)

**Do not create Cron on first deploy.**

After function deploy + signed smoke test + owner approval:

- Use Supabase Cron, external worker, or scheduled GitHub Action
- Recommended interval: **every 5 minutes** (see Section 9)
- `max_instances = 1` or equivalent single-leader semantics
- Cron stores only the signing secret reference, not the raw secret in SQL

## 9. Recommended scheduler interval

**Every 5 minutes** is the recommended starting interval.

Rationale vs rule offsets (Asia/Almaty):

| Rule | Offset | Repeat |
|------|--------|--------|
| `shift_start_soon` | −10 min before start | 1× |
| `clock_in_missing` | +5 min after start | 2×, 10 min apart |
| `shift_end_reached` | at planned end | 1× |
| `clock_out_missing` | +10 min after end | 2×, 10 min apart |

5-minute polling means:

- `shift_start_soon` fires within 0–5 min of threshold (acceptable for pilot)
- `clock_in_missing` attempt 1 within 5 min of +5 min mark
- Repeat intervals (10 min) are covered by subsequent runs
- Reduces load vs 1-minute polling while staying within business tolerance

Adjust to 2 minutes only if pilot metrics show missed windows.

## 10. Cron request signing

Cron caller must:

1. `body = '{}'` (exact raw bytes)
2. `timestamp = floor(unix_now)` (integer seconds)
3. `body_hash = SHA256(raw_body).hex`
4. `canonical = "${timestamp}\nPOST\n${body_hash}"`
5. `signature = "v1=" + HMAC_SHA256(secret, canonical).hex`
6. POST to `/functions/v1/run-time-tracker-notification-scheduler`
7. Headers: `x-shugyla-scheduler-timestamp`, `x-shugyla-scheduler-signature`, `Content-Type: application/json`, `apikey: <anon_key>`

Do **not** send JWT, `service_role` key, or `run_at` in body.

## 11. Where to store Cron secret

| Option | Recommendation |
|--------|----------------|
| Supabase Vault | Preferred if available on plan |
| External secret manager | Preferred for Cron runner outside Supabase |
| Edge Function env | Only for `CURRENT`/`PREVIOUS` verification keys |
| Cron SQL literal | **Forbidden** |
| Git / frontend | **Forbidden** |

## 12. Staged rollout

1. **Deploy** all functions with `TIME_TRACKER_SCHEDULER_ENABLED=false`, seed rules `is_enabled=false`
2. **Signed smoke test** — expect `status: no_enabled_rules` (no writes)
3. **Enable scheduler** — `TIME_TRACKER_SCHEDULER_ENABLED=true`; Cron still off
4. **Manual signed invoke** — confirm `no_enabled_rules` (rules still off)
5. **Enable one rule** — `shift_start_soon` for **one test employee** only
6. **Pilot group** — 5–10 employees, monitor 3–5 days
7. **Enable remaining rules** one at a time
8. **Create Cron** only after steps 5–7 stable

## 13. Rollback

| Action | Safe |
|--------|------|
| `UPDATE notification_rules SET is_enabled = false WHERE ...` | Yes |
| `TIME_TRACKER_SCHEDULER_ENABLED=false` | Yes |
| Stop Cron job | Yes |
| Revert Edge Function deploy | Yes (keep DB) |
| Delete `notifications` | **No** |
| Delete `notification_push_subscriptions` | **No** |

## 14. Verification commands

**DO NOT RUN YET** against production:

```bash
# Local only (safe now)
npm run supabase:local:verify-time-tracker-scheduler-auth
npm run supabase:local:verify-time-tracker-scheduler
npm run supabase:local:verify-time-tracker-dispatch-edge
npm run supabase:local:verify-time-tracker-dispatch-core
npm run supabase:local:verify-web-push-sender

# After production deploy (owner approval required)
# curl signed POST to production scheduler — expect no_enabled_rules while rules disabled
```

## 15. Acceptance matrix

| Scenario | Platform | Required before full rollout |
|----------|----------|------------------------------|
| Permission granted → subscription | Desktop Chrome | Yes |
| PWA installed → push | Desktop Chrome PWA | Yes |
| Background / closed browser | Android Chrome | Yes |
| iOS installed PWA | iPhone Safari | Yes |
| Foreground in-app | All | Yes |
| Click `action_url` | All | Yes |
| Permission denied → in-app only | Desktop | Yes |
| Logout / login | Desktop | Yes |
| Duplicate protection | All | Yes |

## 16. Monitoring and alert thresholds

| Metric | Alert threshold (starting) |
|--------|---------------------------|
| `internal_error` rate | > 0 in 15 min window |
| `scheduler_disabled` responses after enable | Any unexpected |
| `unauthorized` spike | > 5 in 5 min (possible attack) |
| `pushFailed` / `permanently_failed` | > 10% of deliveries in 1 h |
| `no_active_subscription` ratio | Informational only |
| `skippedDuplicates` spike | Investigate if > 50% of matched events |
| Scheduler not invoked | No successful run in 15 min (3× interval) |
| Seed rules accidentally enabled | Any `is_enabled=true` before planned rollout |

## 17. Actions requiring explicit owner approval

The following **must not** be executed by automation or agents without separate written owner confirmation:

- `supabase link` to production project
- `supabase db push` / migration apply to production
- `supabase functions deploy` to production
- Setting production `TIME_TRACKER_SCHEDULER_ENABLED=true`
- Creating production Cron / `pg_cron` job
- Enabling any `notification_rules` (`is_enabled=true`)
- Deploying `send-test-web-push` with test flags enabled
- Rotating or exposing VAPID / scheduler secrets
- Any connection using production project ref or `supabase.co` URL

---

**Next step after this plan:** Create Git checkpoint and run final production preflight locally. All production actions only after explicit owner approval.
