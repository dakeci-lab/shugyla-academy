-- Stage 21 postcheck. Expect: occurrences = 0 for every overload, prosecdef = true, proconfig unchanged (search_path).
select p.oid::regprocedure::text sig,
  (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''Сформировано из планирования закупок''', '')))
    / length('''Сформировано из планирования закупок''') occurrences,
  p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'generate_procurement_orders_from_snapshot';
