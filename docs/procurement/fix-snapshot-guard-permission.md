# PR 1 — Исправление `permission denied for table procurement_snapshots`

**Направление PR:** только БД (одна функция-триггер). Фронтенд, Edge-контракты и RLS-политики не трогаем.
**Автор:** Claude. **Дата:** 2026-08-12

## 0. Статус: реализовано

- миграция `supabase/migrations/20260812032500_fix_procurement_snapshot_guard_security_definer.sql`
- `scripts/verify-procurement-snapshot-guard.mjs`
- `npm run verify:procurement-snapshot-guard-static` — 7 проверок зелёные (включая сверку тела функции)
- `npm run supabase:local:verify-procurement-snapshot-guard` — **не прогнано**, нужен Docker и локальная Supabase
- применение на прод — за владельцем

---

## 1. Симптом

Закупщик в планировании закупа меняет количество товара → после выхода из поля
платформа сохраняет значение → приходит ошибка:

```
permission denied for table procurement_snapshots
```

Воспроизводится у пользователя с правом `procurement.edit` (не админ).

## 2. Причина (подтверждена по коду)

Триггер `before update` на `public.procurement_snapshot_items` вызывает функцию
`public.procurement_snapshot_items_guard_update()`.

| Что | Где |
|-----|-----|
| Объявление функции | `supabase/migrations/20260809072915_procurement_planning_v1.sql:126` |
| Актуальное переопределение | `supabase/migrations/20260810160315_procurement_partial_supplier_generation.sql:114` |
| Блокирующий `select` | там же, строка `166`: `select s.status ... from public.procurement_snapshots ... for share` |
| Права роли `authenticated` | `20260809072915_procurement_planning_v1.sql:642` — только `grant select` |

Функция объявлена как:

```sql
returns trigger
language plpgsql
set search_path = ''
```

**Без `security definer`** → выполняется с правами вызывающего (`authenticated`).

В PostgreSQL блокирующая клауза `FOR SHARE` / `FOR UPDATE` требует привилегии **UPDATE**
на таблицу, а не SELECT (внутри планировщика это `ACL_SELECT_FOR_UPDATE`, равный `ACL_UPDATE`).
У `authenticated` на `procurement_snapshots` есть только `select` → отказ.

**Это упущение, а не замысел:** остальные функции в тех же миграциях объявлены
`security definer` (`20260810160315...:225`, `:603`, `:637`).

## 3. Чего делать нельзя

**Не выдавать `grant update on public.procurement_snapshots to authenticated`.**
Это открыло бы обычному пользователю запись в сами снимки UMAG — фактические данные
(остатки, продажи, цены), которые по замыслу неизменяемы и защищены отдельным guard-триггером.
Ошибка лечится на серверной стороне, а не расширением прав пользователя.

## 4. Исправление

Новая миграция: `supabase/migrations/<timestamp>_fix_procurement_snapshot_guard_security_definer.sql`

Содержимое: `create or replace function public.procurement_snapshot_items_guard_update()`
с **дословно скопированным телом** из последней версии
(`20260810160315_procurement_partial_supplier_generation.sql:114`), с единственным изменением —
добавить `security definer`:

```sql
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
...
$$;

alter function public.procurement_snapshot_items_guard_update() owner to postgres;
```

Требования:

- `set search_path = ''` **сохранить** — с `security definer` это обязательно, иначе search_path-инъекция
- все ссылки внутри тела уже схемо-квалифицированы (`public.…`) — проверить, что так и осталось
- триггер `trg_procurement_snapshot_items_guard_update` пересоздавать **не нужно** (`create or replace` сохраняет привязку)
- тело функции менять запрещено: ни одной строки логики, только заголовок

## 5. Preflight (до применения)

```sql
-- 1. Текущее состояние функции: ожидаем prosecdef = false
select p.proname,
       p.prosecdef,
       pg_get_userbyid(p.proowner) as owner,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'procurement_snapshot_items_guard_update';

-- 2. Права authenticated на снимки: ожидаем только SELECT
select privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'procurement_snapshots'
  and grantee = 'authenticated';

-- 3. Триггер на месте
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.procurement_snapshot_items'::regclass
  and not tgisinternal;
```

Порядок: сначала локальная Supabase (`npm run supabase:local:bootstrap`), затем прод.

## 6. Postcheck (после применения)

```sql
-- prosecdef = true, owner = postgres, proconfig содержит search_path=
select p.prosecdef, pg_get_userbyid(p.proowner) as owner, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'procurement_snapshot_items_guard_update';

-- Права authenticated НЕ изменились: по-прежнему только SELECT
select privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'procurement_snapshots'
  and grantee = 'authenticated';
```

## 7. Rollback

Обратная миграция — та же функция без `security definer`. Применять только осознанно:
откат возвращает исходную ошибку у закупщика.

## 8. Verify-скрипт

`scripts/verify-procurement-snapshot-guard.mjs`, запись в `package.json` как
`verify:procurement-snapshot-guard`. Проверяет на локальной Supabase:

1. `prosecdef = true` и `proconfig` содержит `search_path=` для целевой функции
2. Роль `authenticated` **не** получила `UPDATE` на `procurement_snapshots`
3. От имени пользователя с правом `procurement.edit`: `update procurement_snapshot_items set final_order_qty = …`
   на снимке в статусе `ready` — **проходит**
4. Тот же update на снимке **не** в статусе `ready` — падает с `42501`
   и текстом про «planning fields editable only when snapshot status is ready»
5. Попытка изменить фактическую колонку (например `calculation_stock`) — падает с `42501`
   («fact columns are immutable»)

Пункты 4 и 5 обязательны: они доказывают, что `security definer` не ослабил guard.

## 9. Критерии приёмки

- [ ] Закупщик (не админ, право `procurement.edit`) меняет количество в планировании — сохраняется без ошибки
- [ ] Снимок в статусе не `ready` — правка по-прежнему отклоняется
- [ ] Фактические колонки снимка по-прежнему неизменяемы
- [ ] Права роли `authenticated` не расширены — postcheck подтверждает
- [ ] `verify:procurement-snapshot-guard` зелёный локально
- [ ] В PR нет изменений фронтенда, Edge Functions и RLS-политик
