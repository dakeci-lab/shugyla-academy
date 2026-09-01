# Планирование — ежедневная автосинхронизация UMAG в 07:00 (Актобе)

## 0. Статус: код готов, **не применено на проде** — ждёт подтверждения владельца (2026-09-02)

## 1. Задача

Вторая часть запроса владельца (первая — [planning-sync-button-topbar.md](./planning-sync-button-topbar.md)):
синхронизация UMAG в разделе «Планирование» должна запускаться автоматически
каждый день в 07:00, независимо от ручной кнопки ↻.

## 2. Архитектура — 1:1 повтор уже работающей на проде схемы

В проекте уже есть ровно такой механизм — планировщик тайм-трекера
(`run-time-tracker-notification-scheduler`, живой `cron.job` `jobid=2`,
`* * * * *`). Схема: `pg_cron` → SQL-обёртка (`SECURITY DEFINER`, читает
секреты из `vault.decrypted_secrets`) → подписывает HMAC-SHA256 →
`net.http_post` в Edge Function с заголовками `x-shugyla-scheduler-timestamp`
/ `x-shugyla-scheduler-signature` → функция сверяет подпись через общий
`_shared/schedulerRequestAuth.ts`.

**Решение: не создавать отдельную Edge Function**, а добавить в уже
существующую `umag-procurement` (которая и так обслуживает ручную
синхронизацию) новую ветку авторизации, срабатывающую ДО обычного разбора
JSON и ДО `authorizeWorkforceRequest`:

```
Deno.serve(req):
  rawBody = await req.arrayBuffer()      # читаем один раз, байты нужны и HMAC, и JSON
  if req has 'x-shugyla-scheduler-signature':
     → HMAC-путь (cron), сентинел-«сотрудник», сразу handleSync(...)
  else:
     → обычный путь (кнопка/UI): JSON.parse(rawBody) → authorizeWorkforceRequest → handleSync/...
```

Ключевое следствие: **сама логика синхронизации (`handleSync`, ~300 строк —
UMAG API, снимки, ABC-классификация) не тронута ни на строку** — и ручной,
и автоматический запуск идут по одному и тому же, уже проверенному коду.
Различаются только: (а) кто прошёл авторизацию — реальный сотрудник по JWT
или HMAC-подпись cron-а, и (б) что пишется в `created_by`/`created_by_name`
у снимка (см. ниже).

## 3. Изменения в коде

- **`supabase/functions/umag-procurement/index.ts`**:
  - Импортирован `verifySchedulerRequest`/`isSchedulerSecretConfigured` из
    уже существующего общего `_shared/schedulerRequestAuth.ts` (модуль
    generic, не завязан на тайм-трекер — переиспользован как есть).
  - `Deno.serve` теперь читает `rawBody` один раз (`req.arrayBuffer()`),
    затем либо уходит в HMAC-ветку, либо `JSON.parse` тех же байт для
    обычного пути (было `req.json()` — эквивалентно, просто на явных байтах).
  - HMAC-ветка: свои переменные окружения
    `PROCUREMENT_SYNC_SCHEDULER_ENABLED` /
    `PROCUREMENT_SYNC_SCHEDULER_SECRET_CURRENT` /
    `..._SECRET_PREVIOUS` (по образцу `TIME_TRACKER_SCHEDULER_*`, но
    отдельный секрет — компрометация одного планировщика не даёт доступ
    к другому). Собирает `serviceClient` (service-role) и вызывает
    **тот же** `handleSync(...)`, что и обычный путь, передавая
    синтетический контекст авторизации с сентинел-id `SCHEDULER_CALLER_ID = 0`
    и `permissions: { 'procurement.edit': true }`.
  - В `handleSync` — две строки: если `authz.caller.id === SCHEDULER_CALLER_ID`,
    `created_by = 'system'` и `created_by_name = 'Автосинхронизация (07:00)'`
    вместо запроса в `academy_users` (которого для id=0 всё равно нет).
  - `verify_jwt` у `umag-procurement` **остался `true`** — не менялся.
    Cron-обёртка всё равно проходит гейт, потому что шлёт
    `Authorization: Bearer <anon_key>` (валидный JWT сам по себе,
    гейт-проверка не смотрит на роль внутри, только на подпись) —
    интерактивный путь (реальные сотрудники) как был под полной
    JWT-защитой, так и остался, downgrade безопасности нет.

- **`supabase/migrations/20260902090000_procurement_planning_daily_auto_sync.sql`**
  (новый) — SQL-обёртка `public.invoke_procurement_sync_scheduler()`
  (дословный паттерн `invoke_time_tracker_notification_scheduler`, только
  читает свой секрет `procurement_sync_scheduler_hmac_secret` и шлёт
  `POST .../functions/v1/umag-procurement`) + `cron.schedule(...)` на
  `'0 2 * * *'` — это **02:00 UTC**, что равно **07:00 в Актобе**
  (Asia/Aqtobe = UTC+5, без перехода на летнее время; проверено —
  `show timezone` на проде даёт `UTC`, cron у Supabase тоже работает в UTC).
  Базовый URL и anon-key переиспользуются из уже существующих
  vault-секретов `shugyla_supabase_functions_base_url` /
  `shugyla_supabase_anon_key` (те же, что использует тайм-трекер) —
  новых секретов для них создавать не нужно.

## 4. Что миграция **не** делает — обязательные ручные шаги перед активацией

Секреты никогда не попадают в git. Как и для тайм-трекера, сам HMAC-ключ
и включающие переменные окружения выставляются напрямую в проде, вне
миграций:

1. Сгенерировать новый случайный секрет (32+ байт, base64url) —
   **не** переиспользовать `time_tracker_scheduler_hmac_secret`.
2. Сохранить его в vault под именем `procurement_sync_scheduler_hmac_secret`:
   ```sql
   select vault.create_secret('<СГЕНЕРИРОВАННОЕ_ЗНАЧЕНИЕ>', 'procurement_sync_scheduler_hmac_secret');
   ```
3. Тем же значением выставить секреты Edge Function:
   ```bash
   npx supabase secrets set \
     PROCUREMENT_SYNC_SCHEDULER_ENABLED=true \
     PROCUREMENT_SYNC_SCHEDULER_SECRET_CURRENT=<ТО_ЖЕ_ЗНАЧЕНИЕ> \
     --linked
   ```
4. Задеплоить обновлённую функцию:
   ```bash
   npx supabase functions deploy umag-procurement --linked
   ```
5. Применить миграцию (создаёт SQL-обёртку и cron.job):
   ```bash
   npx supabase db push --linked
   ```

**Порядок важен**: секрет и `ENABLED=true` — до деплоя функции, деплой
функции — до применения миграции (иначе cron успеет один раз выстрелить
в 07:00 против ещё не обновлённой функции; событие безвредно —
до появления секрета функция просто вернёт `scheduler_disabled`, но
чище сделать по порядку).

**Если что-то из шагов 1–3 не сделано** — cron всё равно тикает по
расписанию, но `umag-procurement` отвечает `503 scheduler_disabled`
на HMAC-ветке: безопасный no-op, ни частичной синхронизации, ни ошибки
в существующем ручном пути.

## 5. Postcheck (после применения)

```sql
-- Джоб создан и активен
select jobid, jobname, schedule, active from cron.job
where jobname = 'procurement-sync-scheduler-daily-0700-aqtobe';

-- Ручной прогон обёртки прямо сейчас (не дожидаясь 07:00) —
-- вернёт request_id, реальный результат смотреть в net._http_response
-- по этому id и в снимках procurement_snapshots (created_by = 'system')
select public.invoke_procurement_sync_scheduler();
```

## 6. Rollback

```sql
select cron.unschedule('procurement-sync-scheduler-daily-0700-aqtobe');
drop function if exists public.invoke_procurement_sync_scheduler();
```

Плюс `npx supabase secrets unset PROCUREMENT_SYNC_SCHEDULER_ENABLED PROCUREMENT_SYNC_SCHEDULER_SECRET_CURRENT --linked`
и повторный деплой `umag-procurement` (HMAC-ветка тогда просто не
активируется — код может оставаться в файле, `ENABLED` уже `false` по
умолчанию при отсутствии переменной).

## 7. Verify

```bash
npm run verify:procurement-daily-auto-sync
npm run build
```

27/27 статических проверок: HMAC-ветка существует и проверяется раньше
разбора JSON, свои переменные окружения (не переиспользует
тайм-трекерные), `handleSync` переиспользуется без дублирования логики,
сентинел `created_by`/`created_by_name` не падает на несуществующем id,
SQL-обёртка — `SECURITY DEFINER` с тем же `search_path`, что и у
тайм-трекерной, читает свой секрет + переиспользует существующие
url/anon-key секреты, шлёт `Authorization: Bearer` (иначе `verify_jwt`
на гейте отклонит запрос), cron-расписание — `0 2 * * *` (=07:00 Актобе),
`verify_jwt` у `umag-procurement` не понижен, отдельная Edge Function не
заведена. DB-часть (реальный `cron.schedule`, реальный vault-секрет) не
может быть статически проверена — только живым постчеком по проду
после применения (раздел 5).

## 8. Затронутые файлы

Изменены: `supabase/functions/umag-procurement/index.ts`.

Новое: `supabase/migrations/20260902090000_procurement_planning_daily_auto_sync.sql`,
`scripts/verify-procurement-daily-auto-sync.mjs`, этот файл.

Не тронуто: `supabase/config.toml` (никакой новой функции — переиспользуется
`umag-procurement`, `verify_jwt` не менялся), фронтенд (кнопка ↻ и её
поведение — предыдущая независимая задача,
[planning-sync-button-topbar.md](./planning-sync-button-topbar.md)).
