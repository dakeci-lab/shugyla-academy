# Stage 11 — procurement refetch throttle

**Date:** 2026-10-10
**Scope:** frontend only (no migrations, no Edge changes). One direction: stop passive triggers from re-downloading the whole procurement + receiving module.

## 1. Measurement (prod, Supabase Usage + edge logs)

- Egress by type, 2026-10-06: PostgREST **95.8 MB (96%)**, Storage 2.6 MB, Realtime 0.7 MB, Functions 0.4 MB, Auth 0.2 MB. Weekdays ~85–100 MB/day.
- Wed 2026-10-07, REST calls: `purchase_order_items` GET **1 051** (+945 CORS preflights), `purchase_orders` 154, `receiving_documents` 133, `procurement_snapshot_items` 154 GET + 103 PATCH.
- 1 051 / 154 ≈ 7 pages per full reload → **~150 full reloads of the procurement module per day**; peak 764 requests/hour.
- Realtime itself is cheap (888 messages in 8 days); the cost is the refetch each trigger causes.

## 2. Triggers that caused a full reload

| Trigger | Before | After |
|---|---|---|
| Open `/platform/orders` | always reload | skipped if loaded < 60 s ago |
| Window focus / tab visible / re-subscribe | reload if > 12 s stale | reload if > 60 s stale (module-level freshness) |
| Realtime change event | 400 ms debounce | 2.5 s debounce, 8 s max wait (one reload per burst) |
| Mutations (`afterPurchaseMutation`, generate order, …) | reload | unchanged — always forced |

Concurrent calls no longer multiply: a passive call shares the in-flight request; forced calls wait for it and share ONE trailing refresh (the in-flight data may predate the mutation).

## 3. Changes

- `src/lib/cloudStore.js` — `moduleLoadedAt` set in `markModuleReady`; `getModuleLoadedAt`, `isModuleFresh`.
- `src/services/platformDataService.js` — `refreshProcurementData({ maxAgeMs })`, in-flight sharing, trailing refresh.
- `src/context/PlatformDataContext.jsx` — `reloadProcurement(options)` forwards options.
- `src/pages/platform/orders/OrdersPage.jsx` — mount reload gated by `PROCUREMENT_FRESH_MS`.
- `src/hooks/useProcurementRealtime.js` + `src/services/procurementRealtimeService.js` — passive sources gated; debounce 2.5 s + max wait.
- `src/lib/procurementFreshness.js` — shared constants.

## 4. Verification

- `npm run verify:procurement-refetch-throttle` — runs the real service against a stubbed fetch and counts PostgREST requests (soft refresh while fresh = 0 requests; forced always fetches; burst of 4 forced = 2 cycles).
- `npm run verify:procurement-cross-device-sync` (54/54), `verify:procurement-pagination-ux`, `npm run build` green.
- Pre-existing failures on `main`, unrelated: `verify:procurement-order-actions`, `verify:procurement-mobile-access`.

## 5. Behaviour change to know about

A peer's change is still delivered by the realtime event (forced reload within ≤ 2.5–8 s). Only passive "just in case" reloads are skipped when data is < 60 s old. Pull-to-refresh and own mutations are unaffected.

## 6. Confirm after deploy

`query_logs` for a weekday: `purchase_orders` GETs/day should fall well below the 154 baseline (target < 50), and PostgREST egress/day in Usage should follow. Next steps in this track: bounded window + narrower columns (PR 3), scoped refresh after mutations (PR 4).
