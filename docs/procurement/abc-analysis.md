# ABC-анализ в планировании закупа

Дата: 2026-08-15
Миграция: `supabase/migrations/20260815072607_procurement_abc_analysis.sql`

## Preflight

- Файл миграции создан через `npx supabase migration new procurement_abc_analysis`.
- Прод / remote Supabase не трогаем в этом PR: нет `db push`, `functions deploy`, `link`.
- Локальный Docker/Supabase в среде исполнителя недоступен — live SQL не гонялся; static verify покрывает миграцию и алгоритм.

## Контракт

Три независимые оси на каждый SKU снимка: количество (`sales_8w`), выручка (`revenue_8w` = сумма `saleSellingAmount`), валовая прибыль (`profit_8w` = выручка − себестоимость `saleArrivalAmount`). Период — те же 8 полных недель, что и у снимка. Цену × количество не используем.

Классы A/B/C — Парето 80% / 95% по всей вселенной снимка.

- Нет продаж / нет положительного показателя → класс `NULL`, в UI «—», никогда C.
- Старые снимки остаются `NULL`, пока покупатель не сделает ручной sync.
- Снимок считается ABC-способным, если у загруженной строки есть хотя бы одно записанное денежное поле (`revenue_8w` / `cogs_8w` / `profit_8w`), включая `0`. Класс `NULL` при нулевом движении — это не «старый снимок».
- Убыточные SKU: отрицательная прибыль сохраняется. Если сумма положительных прибылей снимка > 0, убыточные получают C; если положительного итога нет — все NULL.

### Tie policy

Сортировка оси: метрика DESC, затем barcode ASC. Одинаковые метрики — одна группа. Класс группы берётся по накопленной доле **строго больших** метрик (`priorShare`): `< 0.80` → A, `< 0.95` → B, иначе C. Границу 80/95 группа не разрезает. Количество квантуется до 3 знаков (`sales_8w numeric(14, 3)`) после суммирования штрихкода и до группировки, поэтому `0.1+0.2` совпадает с `0.3`.

## Деплой

Прод: порядок обязателен и не обратный.

1. Применить миграцию `20260815072607_procurement_abc_analysis.sql`.
2. Затем задеплоить Edge Function `umag-procurement`.

Без миграции синк не сможет записать ABC-колонки. Без нового Edge старые снимки/строки останутся без ABC-фактов.

### Disposable test project (не прод)

Пустой disposable Supabase-проект (только leftover `snake_*`, пустая migration history) можно поднять без копии прод-данных и без полной платформы:

0. `supabase/tests/fixtures/procurement_abc_staging_bootstrap.sql` — test-only, не migration.
1. `supabase/migrations/20260809072915_procurement_planning_v1.sql`
2. `supabase/migrations/20260809073454_procurement_planning_v1_hardening.sql`
3. `supabase/migrations/20260810160315_procurement_partial_supplier_generation.sql`
4. `supabase/migrations/20260810170350_require_supplier_for_procurement_generation.sql`
5. `supabase/migrations/20260812032500_fix_procurement_snapshot_guard_security_definer.sql`
6. `supabase/migrations/20260812041000_procurement_order_state_rpc.sql`
7. `supabase/migrations/20260812054623_revoke_procurement_snapshot_guard_execute.sql`
8. `supabase/migrations/20260812171700_procurement_norm_taxonomy_rpc.sql`
9. `supabase/migrations/20260814134910_procurement_repeat_analytics_orders.sql`
10. `supabase/migrations/20260815072607_procurement_abc_analysis.sql`

Fixture отказывается работать на production project ref и если public уже не пустой. Permission helper — fail-closed (`false`). Live apply из Cursor не делается.

```bash
npm run verify:procurement-abc-staging-bootstrap
```

## Охрана repeat-order

Миграция не меняет generate RPC, `attempt_key`, fingerprint, reset qty, cancel/restore. ABC не входит в payload fingerprint.

## Проверка

```bash
npm run verify:procurement-abc-analysis
npm run verify:procurement-repeat-analytics-orders
npm run verify:procurement-planning-v1
```
