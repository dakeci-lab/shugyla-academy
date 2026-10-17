# Production Environment Template

**No real secrets.** Set values in Supabase Edge secrets / external secret manager only.

## Edge Function secrets

```env
# Web Push (generate new pair for production — do not copy local keys)
VAPID_PUBLIC_KEY=<set-in-secret-manager>
VAPID_PRIVATE_KEY=<set-in-secret-manager>
VAPID_SUBJECT=mailto:<operations-email>

# Test / manual flows — MUST be false in production initially
WEB_PUSH_TEST_ENABLED=false
TIME_TRACKER_DISPATCH_TEST_ENABLED=false
TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED=false

# Scheduler — disabled on first deploy
TIME_TRACKER_SCHEDULER_ENABLED=false
TIME_TRACKER_SCHEDULER_TEST_MODE=false
TIME_TRACKER_SCHEDULER_SECRET_CURRENT=<minimum-32-byte-secret-base64url>
TIME_TRACKER_SCHEDULER_SECRET_PREVIOUS=<optional-during-rotation>
```

## Frontend build (public only)

```env
VITE_SUPABASE_URL=<production-api-url>
VITE_SUPABASE_ANON_KEY=<production-anon-key>
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=<same-as-VAPID_PUBLIC_KEY>
```

## Must NOT appear in frontend / Git

- `VAPID_PRIVATE_KEY`
- `TIME_TRACKER_SCHEDULER_SECRET_CURRENT` / `PREVIOUS`
- `SUPABASE_SERVICE_ROLE_KEY`
- Push subscription `auth_key` / `p256dh_key`
- Raw JWTs in logs

## Local development (reference only — files are gitignored)

- `.env.local` — `VITE_*` public values only
- `supabase/functions/.env` — Edge secrets including private VAPID + scheduler secret
- `.local-secrets/web-push.env` — source of truth for local VAPID generation

## Production-safe defaults checklist

- [ ] `WEB_PUSH_TEST_ENABLED=false`
- [ ] `TIME_TRACKER_DISPATCH_TEST_ENABLED=false`
- [ ] `TIME_TRACKER_DISPATCH_REAL_TEST_ENABLED=false`
- [ ] `TIME_TRACKER_SCHEDULER_ENABLED=false`
- [ ] `TIME_TRACKER_SCHEDULER_TEST_MODE=false`
- [ ] Seed `notification_rules.is_enabled=false` after migration
- [ ] No env values logged in Edge Functions responses
