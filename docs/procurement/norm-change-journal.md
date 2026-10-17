# Журнал изменений норм запаса

Дата: 2026-10-17 · Этап 16b

## Что это

Таблица `procurement_norm_changes`: когда, категория/подкатегория, **было → стало**, кто изменил.
Раньше в `procurement_norm_rules` хранился только последний редактор. Теперь любое изменение нормы остаётся в истории.

## Как устроено

- Триггер `procurement_norm_rules_journal` на самой таблице норм (insert/update/delete), поэтому пишется любой путь
  изменения, а не только Edge Function.
- Если `norm_days` не изменился (повторное сохранение, возврат норм подкатегорий) — записи нет, журнал без шума.
- Таблица без доступа для `anon`/`authenticated` (RLS включён, права отозваны): читает владелец через SQL/сервисную роль.
  Экрана просмотра пока нет.

## Как посмотреть

```sql
select changed_at, category_name, subcategory_name, old_norm_days, new_norm_days, changed_by_name
from public.procurement_norm_changes order by changed_at desc limit 100;
```

## Проверка

Применено на проде, проверено транзакцией с откатом: повтор того же значения → 0 записей; 14→17 → запись с автором.
`npm run verify:procurement-norm-journal`.

## Откат

```sql
drop trigger procurement_norm_rules_journal on public.procurement_norm_rules;
drop function public.procurement_norm_rules_journal();
drop table public.procurement_norm_changes;
```
