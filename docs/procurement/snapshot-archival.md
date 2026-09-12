# Архивация снимков закупа (procurement_snapshot_items)

**Дата:** 2026-09-12
**Причина:** `procurement_snapshot_items` выросла до 302 МБ / 378 434 строк — 77%
всей базы (0.393 / 0.5 ГБ, free tier). Grace period истёк 8 сентября, Fair
Use Policy уже действует. Каждая синхронизация UMAG (включая ежедневную
авто-синхронизацию в 07:00 Aqtobe, см. `planning-daily-auto-sync.md`)
создаёт новый неизменяемый снимок и не чистит старые.

## Что делает система

1. **Сводка навсегда** (`procurement_snapshot_category_rollup`) — копеечная
   по весу таблица: по категории/подкатегории на день — счётчики (позиций,
   отриц. остатков, к заказу, по `reserve_status`) и суммы (закупочная/
   продажная стоимость остатка). Считается один раз перед архивацией снимка
   и остаётся в базе навсегда — закрывает потребность в трендах для
   аналитики магазина.
2. **Архив сырых данных** — перед удалением все товарные позиции снимка
   выгружаются в `.csv.gz` в приватный Storage-бакет
   `procurement-snapshot-archives` (своя, отдельная от Database, квота —
   сейчас занято ~7% из 1 ГБ). Доступен для скачивания из «Склад».
3. **Удаление** — только после успешной загрузки архива (`archive_path`
   проставлен), удаляются строки `procurement_snapshot_items` для этого
   снимка. Сам снимок (`procurement_snapshots`) не трогается — дата,
   статус, счётчики, пользователь остаются, «Склад» продолжает их
   показывать.

**Что никогда не архивируется:**
- Единственный самый свежий снимок со статусом `ready`/`generated` — на нём
  живут Планирование/ABC/Нормы.
- Снимки со статусом `partially_generated` или `syncing` — их теоретически
  ещё можно доделать через `generate`/`set_norm`.
- Снимки младше 7 дней (настраивается через `p_cutoff_days` в
  `get_procurement_snapshots_eligible_for_archive`).

## Разовая настройка (сделать один раз)

Применить миграцию `20260912090000_procurement_snapshot_archival.sql`
(`npx supabase db push --linked` или вставить в SQL Editor).

Затем в SQL Editor:

```sql
select vault.create_secret(
  encode(gen_random_bytes(32), 'base64'),
  'procurement_archive_scheduler_hmac_secret'
);
```

Скопировать возвращённое значение (или прочитать его заново через
`select decrypted_secret from vault.decrypted_secrets where name = 'procurement_archive_scheduler_hmac_secret';`)
и задать секреты Edge Function:

```bash
npx supabase secrets set \
  PROCUREMENT_ARCHIVE_SCHEDULER_ENABLED=true \
  PROCUREMENT_ARCHIVE_SCHEDULER_SECRET_CURRENT="<то же значение>" \
  --linked
```

Пока оба секрета не заданы, cron-джоб стучится по расписанию, но функция
отвечает `503 scheduler_disabled` — безопасный no-op, ничего не ломает.

Проверить, что джоб зарегистрирован:

```sql
select jobname, schedule from cron.job where jobname like 'procurement-archive%';
```

## Срочная чистка текущего backlog (~40+ снимков)

Cron сам обработает всё за несколько дней (по 5 снимков в день), но раз
квота уже почти исчерпана — можно ускорить, запуская вручную по батчам:

```sql
select public.invoke_procurement_archive_scheduler();
```

Это асинхронно (через `net.http_post`, ответа сразу не будет) — подождите
~10–15 секунд между вызовами и повторяйте, пока размер
`procurement_snapshot_items` не перестанет уменьшаться:

```sql
select pg_size_pretty(pg_total_relation_size('public.procurement_snapshot_items'));
```

Логи выполнения (успех/ошибка) смотреть в Dashboard → Edge Functions →
procurement-archive → Logs.

## Важно: `DELETE` не уменьшает физический размер сразу

Postgres не возвращает место на диск сразу после `DELETE` — “мёртвые”
страницы остаются до `VACUUM`. Обычный `VACUUM` (запускается автоматически
autovacuum-ом) освобождает место для повторного использования *внутри*
таблицы, но не обязательно уменьшает отчётный размер базы. Чтобы он
реально уменьшился (и освободил квоту), после того как чистка отработает
по всему backlog, один раз выполнить:

```sql
vacuum full public.procurement_snapshot_items;
```

Это возьмёт эксклюзивную блокировку таблицы на время выполнения — лучше
делать не в рабочие часы (например, ночью). На 300 МБ таблице должно
занять до нескольких минут в зависимости от того, сколько останется.

## Проверка результата

```sql
select
  pg_size_pretty(pg_database_size(current_database())) as total_db_size,
  pg_size_pretty(pg_total_relation_size('public.procurement_snapshot_items')) as items_size,
  count(*) as remaining_rows
from public.procurement_snapshot_items;
```

И в Dashboard → Settings → Usage — Database Size должен упасть заметно
ниже 79%.
