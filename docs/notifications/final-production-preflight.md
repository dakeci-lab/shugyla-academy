# Final Production Preflight

**Status:** local verification complete. **No production actions performed.**

Related documents:

- [migration-preflight.md](./migration-preflight.md)
- [edge-functions-preflight.md](./edge-functions-preflight.md)
- [production-env-template.md](./production-env-template.md)
- [security-preflight.md](./security-preflight.md)
- [production-deploy-plan.md](./production-deploy-plan.md)
- [production-readiness.md](./production-readiness.md)

## 1. Local system status

| Component | Status |
|-----------|--------|
| Notification DB foundation | Local ✓ |
| Web Push subscriptions + delivery | Local ✓ |
| Auth-first login | Local ✓ |
| Employee provisioning (Edge) | Local ✓ |
| Dispatch core + Edge + scheduler | Local ✓ |
| HMAC scheduler auth | Local ✓ |
| Manual user `web-push-manual-staff` | Preserved ✓ |
| Seed `notification_rules` | 4 rules, **all disabled** |
| Production connection | **None** |
| Cron / pg_cron | **None** |

## 2. Successful verification matrix

| Command | Expected |
|---------|----------|
| `webpush:local:verify-vapid-integrity` | exit 0 |
| `supabase:local:verify-notifications` | exit 0 |
| `supabase:local:verify-auth-first` | exit 0 |
| `supabase:local:verify-employee-provisioning` | exit 0 |
| `supabase:local:verify-employee-admin-access` | exit 0 |
| `supabase:local:verify-web-push-foundation` | exit 0 |
| `supabase:local:verify-web-push-sender` | exit 0 |
| `supabase:local:verify-time-tracker-dispatch-core` | exit 0 |
| `supabase:local:verify-time-tracker-dispatch-edge` | exit 0 |
| `supabase:local:verify-time-tracker-manual-dispatch` | exit 0 |
| `supabase:local:verify-time-tracker-scheduler` | exit 0 |
| `supabase:local:verify-time-tracker-scheduler-auth` | exit 0 |
| `npm run build` | exit 0 |

> Note: `supabase:local:verify-notifications` maps to `verify-notification-foundation.mjs`.

## 3. VAPID integrity result

- **Key pair valid:** private matches public (ECDH P-256)
- **Frontend matches Edge:** all three sources aligned
- **Canonical fingerprint:** `71653018b9bcdd1b`
- **Step 18 vs 21B discrepancy:** different fingerprint **algorithms**, not different keys
  - `71653018b9bcdd1b` — canonical (SHA-256 of decoded raw public key bytes)
  - `684e162f76d9bd71` — legacy (SHA-256 of base64url string)

## 4. Migration order

See [migration-preflight.md](./migration-preflight.md) — 7 migrations in timestamp order.

## 5. Edge Function deployment order

1. `manage-push-subscription`
2. Admin functions
3. `dispatch-time-tracker-notifications` (test flags false)
4. `run-time-tracker-notification-scheduler` (`ENABLED=false`)
5. Skip `send-test-web-push` by default

## 6. Production env / secrets checklist

See [production-env-template.md](./production-env-template.md).

## 7. Functions disabled initially

| Flag / function | Production initial value |
|-----------------|--------------------------|
| `WEB_PUSH_TEST_ENABLED` | `false` |
| `TIME_TRACKER_DISPATCH_TEST_ENABLED` | `false` |
| `TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED` | `false` |
| `TIME_TRACKER_SCHEDULER_ENABLED` | `false` |
| `TIME_TRACKER_SCHEDULER_TEST_MODE` | `false` |
| `send-test-web-push` | not deployed (default) |
| All `notification_rules` | `is_enabled=false` |

## 8. Scheduler / Cron prerequisites

- Scheduler function deployed with HMAC secret in vault
- Signed smoke test (`status: no_enabled_rules`) before enable
- Cron created **only after owner approval** — 5-minute interval recommended
- Cron stores secret in Vault / secret manager, not SQL

## 9. Rule rollout order

1. `shift_start_soon` — one test employee
2. Pilot group (5–10)
3. `clock_in_missing` → `shift_end_reached` → `clock_out_missing`
4. Full rollout

## 10. Rollback procedure

1. `UPDATE notification_rules SET is_enabled = false`
2. `TIME_TRACKER_SCHEDULER_ENABLED=false`
3. Stop Cron
4. Do **not** delete notifications or subscriptions

## 11. Monitoring requirements

- `accepted` / `retryable` / `permanently_failed` delivery counts
- `no_active_subscription` rate
- `skippedDuplicates` spikes
- `unauthorized` on scheduler (attack indicator)
- Scheduler run gaps > 15 min

## 12. Mobile / PWA acceptance tests

Desktop Chrome, PWA installed, Android, iOS installed PWA, foreground/background, browser closed, permission denied, duplicate protection, action_url navigation.

## 13. Known risks

- `20260714120000` removes permissive anon policy on `academy_users`
- Duplicate migration filename `20260714062253` vs `20260714150000`
- Legacy `academy_users.password` column still exists

## 14. Remaining technical debt

- Drop or null `academy_users.password` after full Auth migration
- Admin UI password field for legacy offline path
- Production Cron + retry worker not implemented
- Rules admin UI not implemented

## 15. Explicit owner approvals required

- `supabase link` to production
- `db push` / migration apply
- `functions deploy`
- Production secret values
- `TIME_TRACKER_SCHEDULER_ENABLED=true`
- Cron job creation
- Any `notification_rules.is_enabled=true`
- Deploy `send-test-web-push` to production

## 16. Exact first production action — DO NOT RUN YET

After owner confirmation:

```bash
# READ-ONLY — requires explicit approval
supabase migration list --linked
```

Compare against [migration-preflight.md](./migration-preflight.md). **No writes until separate approval.**
