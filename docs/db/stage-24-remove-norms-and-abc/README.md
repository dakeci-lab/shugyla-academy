# Этап 24 — удаление мёртвых норм и ABC из базы и функций (пакет)

Что внутри одного пакета (одна ветка/PR):
- **Edge-функции:** `umag-procurement` (больше не читает правила норм, не считает ABC, не принимает `set_norm`, вставляет факты с нулевой рекомендацией — план считает БД), файл `abcClassification.js` → `salesAggregation.js` без ABC;
  `procurement-archive` (в архив идут `target_days` и `plan_status` вместо `norm_days` и `reserve_status`).
- **Миграция** `20261026100000_remove_norms_and_abc.sql`: переписывает две функции, удаляет таблицы норм, три функции, пять колонок позиций снимка и право `procurement.norms.manage`. Одна транзакция, без `CASCADE`/`IF EXISTS`.
- `preflight.sql`, `postcheck.sql`, `rollback.md`.

## Порядок выполнения (важен)

1. Слить PR (код функций в `main`).
2. **Задеплоить функции** `umag-procurement procurement-archive` (GitHub → Actions → Deploy Supabase Edge Functions; нужен секрет `SUPABASE_ACCESS_TOKEN`).
   Старые версии после п.3 ломаются (читают удалённое), поэтому п.2 строго раньше п.3.
3. Запустить `preflight.sql`, убедиться в ожидаемых числах.
4. Выполнить миграцию (`drop` требует интерактивного подтверждения — через MCP либо вставить файл в Supabase → SQL Editor и нажать Run).
5. `postcheck.sql`: везде нули, виджет шкалы возвращает числа.
6. Проверить в браузере «Закуп» и один ночной синк (07:00 или кнопка).

**Статус: применено 2026-10-25**, см. `APPLY-REPORT.md`.
