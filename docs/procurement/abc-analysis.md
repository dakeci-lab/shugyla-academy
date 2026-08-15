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
- Убыточные SKU: отрицательная прибыль сохраняется. Если сумма положительных прибылей снимка > 0, убыточные получают C; если положительного итога нет — все NULL.

### Tie policy

Сортировка оси: метрика DESC, затем barcode ASC. Одинаковые метрики — одна группа. Класс группы берётся по накопленной доле **строго больших** метрик (`priorShare`): `< 0.80` → A, `< 0.95` → B, иначе C. Границу 80/95 группа не разрезает.

## Охрана repeat-order

Миграция не меняет generate RPC, `attempt_key`, fingerprint, reset qty, cancel/restore. ABC не входит в payload fingerprint.

## Проверка

```bash
npm run verify:procurement-abc-analysis
npm run verify:procurement-repeat-analytics-orders
npm run verify:procurement-planning-v1
```
