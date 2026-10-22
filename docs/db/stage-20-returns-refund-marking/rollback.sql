-- Stage 20 rollback (run in one transaction). Safe: no frontend uses the columns until PR 2.
begin;
drop policy if exists umag_supply_returns_update_refund_mark on public.umag_supply_returns;
revoke update (platform_refunded_at, platform_refunded_by, platform_refund_account_id)
  on table public.umag_supply_returns from authenticated;
drop index if exists public.idx_umag_supply_returns_platform_refunded_at;
drop index if exists public.idx_umag_supply_returns_platform_refund_account_id;
drop index if exists public.idx_umag_supply_returns_platform_refunded_by;
alter table public.umag_supply_returns
  drop column platform_refunded_at,
  drop column platform_refunded_by,
  drop column platform_refund_account_id;
commit;
