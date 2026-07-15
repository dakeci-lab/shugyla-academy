# Production Notification Migration Reconciliation — Step 22P

**Date:** 2026-07-15  
**Problem:** Local canonical migrations overlap with production Auth Phase 1/2 already applied. General `supabase db push` would risk re-applying Auth SQL or the zero-byte stub.

---

## Production state before reconciliation

| Migration | Remote status |
|-----------|---------------|
| `20260714172032` production_auth_bridge_phase1 | applied (SQL) |
| `20260714210000` production_auth_security_cutover_phase2 | applied (SQL) |
| `20260713194500` … `20260714160000` | **missing** from history |
| `20260714062253` empty stub | **must never apply** |
| Notification tables | **0** |

---

## Overlap analysis

| Local migration | Auth overlap | Notification content | Production action |
|-----------------|--------------|----------------------|-------------------|
| `20260713194500` | `auth_user_id` DDL + backfill | full notification foundation | **extract** → reconciliation only |
| `20260714120000` | Phase 2 anon revoke | none | **repair** (equivalent via Phase 2) |
| `20260714130000` | service grants | employee provisioning grants | **extract** grants portion |
| `20260714140000` | none | web push subscriptions | **extract** |
| `20260714150000` | none | delivery tracking | **canonical** — extract |
| `20260714160000` | none | dispatch grants | **extract** |
| `20260714062253` | n/a | **0 bytes** | **delete locally**, never repair |

### Safety rules enforced

- No `ADD COLUMN auth_user_id`
- No backfill `auth_user_id`
- No Phase 2 policy removal replay
- No anon grant restoration
- No Phase 3 SQL
- No Cron SQL
- Rules seeded with `enabled = false`

---

## Reconciliation migrations created

| Version | File | Contents |
|---------|------|----------|
| `20260714230000` | `production_notification_foundation_reconciliation.sql` | Tables, RLS, helpers, seeds (4 templates + 4 disabled rules) |
| `20260714231000` | `production_web_push_foundation_reconciliation.sql` | Subscription + delivery tracking columns/indexes |
| `20260714232000` | `production_notification_grants_reconciliation.sql` | `service_role` dispatch + shift grants |

All statements use `IF NOT EXISTS` / idempotent patterns where appropriate. Preconditions assert Phase 1 column and absence of legacy anon policy.

---

## Apply method

```bash
# Per migration — NOT db push
supabase db query --linked -f supabase/migrations/<file>.sql
supabase migration repair --status applied <version> --linked
```

Order: `20260714230000` → `20260714231000` → `20260714232000`

---

## Repair plan (after object equivalence)

| Version | SQL executed | Repair justified by |
|---------|--------------|---------------------|
| `20260713194500` | no | reconciliation `20260714230000` + Phase 1 column |
| `20260714120000` | no | Phase 2 `20260714210000` |
| `20260714130000` | no | reconciliation `20260714232000` |
| `20260714140000` | no | reconciliation `20260714231000` |
| `20260714150000` | no | reconciliation `20260714231000` |
| `20260714160000` | no | reconciliation `20260714232000` |
| `20260714062253` | **never** | empty stub deleted from repo |

---

## Object equivalence verification

| Required object | Verified |
|-----------------|----------|
| 6 `notification_*` tables | **yes** |
| RLS enabled, anon denied | **yes** |
| 4 templates | **yes** |
| 4 rules, `enabled = 0` | **yes** |
| `device_id`, `request_id` on deliveries | **yes** |
| `service_role` on notifications/deliveries/shifts | **yes** |
| `employee_owned_by_current_auth()` unchanged | **yes** (Phase 1) |
| Phase 2 anon policies absent | **yes** |
| Cron jobs | **0** |

---

## Post-reconciliation migration history

```
20260713194500  repaired
20260714120000  repaired
20260714130000  repaired
20260714140000  repaired
20260714150000  repaired (canonical delivery)
20260714160000  repaired
20260714172032  applied (Phase 1)
20260714210000  applied (Phase 2)
20260714230000  applied (reconciliation)
20260714231000  applied (reconciliation)
20260714232000  applied (reconciliation)
```

`supabase db push --linked --dry-run` → **no pending migrations**.

---

## Empty stub handling

| Check | Result |
|-------|--------|
| `20260714062253` size before delete | **0 bytes** |
| Referenced by tests/scripts | **no** (verify script updated to require absence) |
| Canonical `20260714150000` present | **yes** |
| Remote history contains stub | **no** |

---

## Local fresh-database note

Reconciliation migrations include existence guards so a fresh local DB that already applied canonical migrations `20260713194500`–`20260714160000` does not fail on duplicate objects. Local sequence: canonical migrations first, then reconciliation files are no-ops or partial no-ops.

---

## Rollback

No automatic rollback performed. Emergency manual rollback would require dropping notification objects only — **not attempted**. Business data and Phase 2 RLS preserved.
