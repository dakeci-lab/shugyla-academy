# Local Supabase Bootstrap

Документ описывает локальный bootstrap Shugyla Academy без подключения к production Supabase.

## Для чего нужен

Локальная разработка требует полной схемы БД:

1. Базовые таблицы из `supabase/schema.sql` (включая `academy_users`).
2. Timestamp-миграции (`20260712163000_*`, `20260713194500_*`).

Supabase CLI **не применяет** `schema.sql` автоматически при `start` или `db reset`, если указать его только в `schema_paths`. Поэтому bootstrap выполняет проверенный порядок одной командой.

## Почему `schema.sql` отдельно

`supabase/schema.sql` — частичная DDL-схема проекта (Academy, смены, поставщики). Она создаёт `public.academy_users` и другие базовые объекты **до** RBAC migration, которая делает `ALTER TABLE academy_users`.

Без `schema.sql` первая timestamp-миграция падает:

```
ERROR: relation "academy_users" does not exist
```

## Почему `schema_paths` не заменяет migration execution

`schema_paths` в `[db.migrations]` предназначен для **declarative schema** workflow (`supabase db diff`), а не для автоматического исполнения SQL при `start`/`reset`.

Фактическое поведение CLI (v2.109.x):

- `supabase start` / `db reset` → применяют только файлы из `supabase/migrations/` с форматом `<timestamp>_name.sql`;
- `schema_paths` → не исполняет `schema.sql` как pre-migration step.

## Legacy-файлы без timestamp

24 SQL-файла в `supabase/migrations/` с именами вида `add_*.sql` **пропускаются** Supabase CLI:

```
Skipping migration add_employee_shifts.sql... (file name must match pattern "<timestamp>_name.sql")
```

Их содержимое частично дублируется в `schema.sql`. Bootstrap **не переименовывает** legacy-файлы — это отдельное решение для production pipeline.

## Команда запуска

```bash
npm run supabase:local:bootstrap -- --reset
```

Без `--reset` скрипт **ничего не удаляет**, выводит справку и завершается с кодом `1`.

## Предупреждение

**`--reset` удаляет только локальную Supabase-базу** проекта `shugyla-academy` (Docker volumes через `supabase stop --no-backup`).

Команда **не затрагивает**:

- production Supabase;
- remote project link;
- `.env.local`;
- GitHub;
- рабочие пользовательские данные вне локального Docker.

## Требования

- Docker Desktop (Engine running)
- Node.js (ES modules)
- `npx supabase` CLI (скачивается автоматически)
- Свободные локальные порты (по умолчанию: API `54321`, DB `54322`, Studio `54323`)
- `supabase/config.toml` с `[db.migrations] enabled = false`

## Что проверяется после bootstrap

- `public.academy_users` и `academy_users.auth_user_id`
- RBAC: `roles`, `permissions`, `role_permissions`
- 6 таблиц уведомлений
- 4 seed-шаблона `time_tracker.*`
- 4 seed-правила `time_tracker.rule.*` (все `is_enabled = false`)
- Migration history: `20260712163000`, `20260713194500`

## После bootstrap

Проверка notification foundation (backfill, RLS, constraints):

```bash
npm run supabase:local:verify-notifications
```

Скрипт создаёт только временные локальные пользователи и удаляет их после проверки. Production не используется. Web Push не отправляется.

Verification checklist (дополнительно к backfill/RLS/constraints):

- схема `notification_private` существует и **не** exposed через API;
- функция `notification_private.employee_owned_by_current_auth(bigint)` — SECURITY DEFINER, пустой `search_path`;
- `PUBLIC` и `anon` не имеют `EXECUTE` на helper;
- `authenticated` имеет `EXECUTE`, но **не** имеет `SELECT` на `academy_users`;
- push subscriptions / preferences проходят RLS через helper без прямого подзапроса к `academy_users`.
- `mark_notification_read` / `mark_notification_read_internal` ACL и owner-only runtime;
- idempotency (повторный RPC не меняет `read_at`/`updated_at`);
- anon deny на RPC;
- direct UPDATE notifications deny.

## Troubleshooting

| Проблема | Действие |
|----------|----------|
| Docker daemon unavailable | Запустить Docker Desktop, проверить `docker ps` |
| Порт занят | Остановить другой Supabase: `npx supabase stop --all` |
| `schema.sql` error | Проверить вывод psql, ON_ERROR_STOP покажет первую ошибку |
| Migration error | Проверить, что `schema.sql` применился до `migration up` |
| Remote project link detected | Удалить link metadata вручную; не использовать `supabase link` для production |
| Недостаточно места на диске | Освободить ≥10 GB для Docker images/volumes |
| `[db.migrations] enabled must be false` | В `config.toml` установить `enabled = false` для local bootstrap |

## Файлы

- Скрипт: `scripts/supabase-local-bootstrap.mjs`
- npm script: `supabase:local:bootstrap`
- Конфиг: `supabase/config.toml`
- Базовая схема: `supabase/schema.sql`
