# CLAUDE.md — контекст проекта Shugyla

> Опись проекта для AI-агентов. Обновлять при смене архитектуры, домена или этапа работ.
> Дата составления: 2026-08-12. Ветка на момент описи: `agent/careers-production`.

## 1. Что это

Внутренняя платформа управления продуктовым супермаркетом **Shugyla Market** (Актобе, KZ).
Исторически начиналась как обучающая платформа («Shugyla Academy» — отсюда имя репозитория),
сейчас academy-часть удалена/редиректится, а продукт = ERP-подобная платформа для персонала и закупа.

Источник учётных данных — **UMAG** (`api.umag.kz`), система автоматизации магазина. Данные тянутся
через Supabase Edge Functions и складываются в собственные таблицы Postgres.

## 2. Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 19 + Vite 6 + React Router 7, чистый CSS (без UI-библиотек) |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions на Deno/TypeScript) |
| Прод-хостинг | PS.kz / Plesk — деплой артефактом в ветку `ps-production` через GitHub Actions |
| CI | GitHub Actions: `deploy-ps-production.yml`, `main.yml`, e2e recruitment (staging/prod) |
| Тесты | Playwright (`tests/`) + ~140 самописных `verify:*` node-скриптов в `scripts/` |
| Прочее | PWA (sw.js, manifest), Web Push (VAPID), xlsx, pdfmake, qrcode |

Зависимости намеренно минимальны — нет TypeScript на фронте, нет state-библиотек,
нет Tailwind. Не вводить новые зависимости без обсуждения.

## 3. Домены (три поверхности из одного билда)

`src/router/hostSurface.js` определяет поверхность по hostname:

| Домен | Поверхность | Содержимое |
|-------|-------------|-----------|
| `shugyla-market.kz` | CORPORATE | корпоративный сайт (`CorporateHome`) |
| `web.shugyla-market.kz` | PLATFORM | внутренняя платформа `/platform/*` |
| `jobs.shugyla-market.kz` | CAREERS | вакансии + публичные заявки (`/vacancies`, `/apply`) |
| `localhost`, `dakeci-lab.github.io` | COMBINED | всё вместе (dev + легаси GitHub Pages) |

Легаси-прод `dakeci-lab.github.io/shugyla-academy/` ещё упоминается в perf-документах.

## 4. Модули платформы (`/platform/*`)

- **Персонал**: список, профиль, документы, аватары, график работы, рейтинг, тайм-трекер (check-in/out, ночные смены), расчёт зарплаты
- **HR / рекрутинг**: вакансии, кандидаты, публичная форма заявки, приглашения на интервью, hiring flow
- **Закуп (procurement)**: планирование по нормам, генерация заказов по поставщикам, аналитика, экспорт
- **Приёмка (receiving)**: приход товара, сверка
- **Поставщики**: справочник (сеян из UMAG), взаиморасчёты (settlements), платёжные обязательства
- **Товары**: ценники (price-tags)
- **Уведомления**: in-app inbox + Web Push, диспетчер тайм-трекера, эскалации админам
- **Настройки**: общие, роли (RBAC), уведомления

## 5. Архитектура данных

**Adapter pattern.** Каждый домен имеет пару адаптеров: `*LocalAdapter.js` (localStorage,
демо/офлайн-режим) и `*SupabaseAdapter.js` (прод). Выбор через `src/lib/dataMode.js`
(`isCloudMode`). Оркестратор — `src/services/platformDataService.js`.

**Кэш в памяти** — `src/lib/cloudStore.js`: модульные состояния загрузки
(`markModuleLoading/Ready/Error`, `ensureModuleLoaded`). После Stage 1 оболочка приложения
рендерится сразу после Auth+RBAC, модули догружаются лениво по маршруту.

**React-контексты** (`src/context/`): Session, PlatformData, Permission (RBAC), Language,
NotificationInbox, DevicePermissions, PullToRefresh, Toast, PlatformPageTitle.

**RBAC** — гибкий, в БД (`add_rbac_flexible_v2.sql`), проверки прав и на фронте
(`PermissionContext`), и в Edge Functions (`_shared/employeeAuthorization.ts`),
и в RLS-политиках. Права строкой вида `umag.settlements.sync`.

## 6. Edge Functions (`supabase/functions/`)

UMAG-интеграция (креды UMAG **никогда** не уходят на клиент — `_shared/umagAuth.ts`):

- `umag-sync` — поставщики, поставки, возвраты, платежи по документам
- `umag-procurement` — планирование закупа
- `umag-operation-details`, `umag-probe-payments` (*незакоммичена*)

Админ/персонал: `admin-create-employee`, `admin-list-employees`, `admin-update-employee`,
`admin-manage-employee-schedule`, `admin-team-workforce-data`, `admin-notification-settings`,
`employee-time-tracker-action`.
Пуши: `manage-push-subscription`, `dispatch-time-tracker-notifications`,
`run-time-tracker-notification-scheduler`, `send-test-web-push`.

## 7. База данных

`supabase/migrations/` — 82 файла, смешанные соглашения об именах: часть с таймстампом
(`20260809072915_procurement_planning_v1.sql`), часть просто описательные
(`add_rbac_system.sql`). Актуальный слепок — `supabase/schema.sql`.

Крупные операции с БД оформляются как «этапы» с preflight / apply / postcheck / rollback —
см. `docs/db/stage-7a-academy-learning-removal/` как эталон процесса.

## 8. Где остановились (по состоянию на 2026-08-12)

### 8.0 Живой баг — приоритет владельца

`permission denied for table procurement_snapshots` при изменении количества в планировании закупа.

**Причина найдена и подтверждена по коду.** Триггер
`public.procurement_snapshot_items_guard_update()`
(`supabase/migrations/20260809072915_procurement_planning_v1.sql:126`, переопределён в
`20260810160315_procurement_partial_supplier_generation.sql:114`) объявлен как
`language plpgsql set search_path = ''` — **без `security definer`**, то есть выполняется
с правами вызывающего. Внутри он делает
`select s.status from public.procurement_snapshots where s.id = new.snapshot_id for share`
(строка 166). В PostgreSQL блокирующая клауза `FOR SHARE` требует привилегии `UPDATE`
на таблицу, а роли `authenticated` выдан только `grant select on procurement_snapshots`
(строка 642). Отсюда отказ.

Остальные функции в тех же миграциях `security definer` (строки 225, 603, 637) —
то есть это упущение, а не замысел.

**Правильное исправление:** добавить `security definer` этому триггеру (сохранив
`set search_path = ''`, владелец `postgres`). Права пользователя расширять **нельзя** —
`grant update` на `procurement_snapshots` для `authenticated` открыл бы запись в снимки.

**Оба PR написаны Claude, лежат незакоммиченными в рабочем дереве:**

- `docs/procurement/fix-snapshot-guard-permission.md` — PR 1, только БД, одна функция.
  Миграция `20260812032500_fix_procurement_snapshot_guard_security_definer.sql`,
  `verify:procurement-snapshot-guard-static` зелёный, DB-часть верификации требует Docker.
- `docs/procurement/order-actions-ux.md` — PR 2, только фронтенд, миграций нет.
  `verify:procurement-order-actions` — 45 проверок зелёные.

Не сделано: прогон с локальной Supabase, клик руками в `npm run dev`, применение миграции на прод.

Побочно появился `scripts/lib/extensionlessResolver.mjs` — loader-хук, который позволяет
verify-скриптам импортировать реальные модули приложения (Vite-импорты без расширений,
JSON, `import.meta.env`). Использовать в новых verify-скриптах вместо проверок регулярками.

Решения по UX кнопок заказа (приняты владельцем 2026-08-12): возврат в черновик разрешён,
пока склад не начал приёмку; отменённые заказы — через фильтр «Отменённые»; экспорт остаётся
двумя иконками (объединение в одну кнопку отклонено); удаление черновика мягкое.
Отложено отдельным PR: генерация заказа в `draft` + явная кнопка «Отправить поставщику».

Попутно найденный дефект (входит в PR 2): отмена заказа не отменяет связанный документ
приёмки — склад продолжает ждать поставку по отменённому заказу
(`purchaseSupabaseAdapter.js:530`).

### 8.1 Трек производительности загрузки Документация: `docs/performance/`.

- Stage 1 — прогрессивный bootstrap + изоляция сбоев модулей: **сделано** (`d4307b0`)
- Stage 2 — замер production-baseline с авторизацией: **сделано** (доки, без изменений кода)
- **Stage 3 — Variant A: гигиена дублей и waterfall — следующий шаг, не начат**

Подтверждённый P1 из Stage 2 (`S2-F03`): штормы дублирующих запросов —
`admin-team-workforce-data` ×2 на Home, `admin-list-employees` ×7 и RBAC-каталог ×7–8
на Employees. Один вызов workforce сам по себе ~3–7 с → Home готов за ~6–10 с.

Задачи Stage 3: coalescing in-flight запросов, устранение remount/effect-штормов,
один вызов workforce на cold load. Отложено сознательно: Variant E (сужение Edge-контракта
workforce), Variant F (`React.lazy`, бандл 1.35 МБ), индексы, RLS-хелперы, обрезка `select('*')`.
Полный реестр находок — `docs/performance/findings-backlog.md` (F-01…F-15, S2-F01…S2-F04).

**Параллельный трек** — corporate + careers поверхности запущены и **уже в проде**.
Ветка `agent/careers-production` полностью влита в `origin/main` (уникальных коммитов 0) —
её можно удалять. Прод (`web.shugyla-market.kz/version.json`) отдаёт `c6fc3e6` = голова
`origin/main`, деплой-пайплайн работает. Локальный `main` отставал на 4 коммита — нужен `git pull`.

**Масштаб использования:** ~13–15 сотрудников работают в платформе ежедневно.
Значит: 6–10 с загрузки Home — это реальная ежедневная боль, но и рефакторинг
требует аккуратности (нельзя ломать рабочий инструмент живой смены).

**Незакоммичено в рабочем дереве:** правки perf-доков, `docs/performance/stage-2-production-baseline.md`,
`scripts/audit-stage2-manual-checklist.md`, `supabase/functions/umag-probe-payments/`, `tmp/`.

## 9. Процесс работы

Роли: пользователь (Данияр, владелец бизнеса) ставит цель → **Claude = бригадир**
(проектирование, ТЗ и промпты для исполнителя, ревью результата) → **Cursor = исполнитель**
(пишет код, гоняет миграции). Ранее бригадиром был ChatGPT Codex — отсюда ветки `codex/*`.
Ветки: `main`, `agent/*`, `codex/*`, `cursor/*`, артефакт-ветка `ps-production` (не трогать вручную).

Правила, выведенные из истории проекта:

1. **Один PR = одно направление.** Не смешивать frontend-фикс + контракт Edge + RLS.
2. **Сначала замер, потом оптимизация.** Каждый этап начинается с baseline-документа.
3. **Каждая фича получает `verify:*` скрипт** в `scripts/` и запись в `package.json`.
4. **Каждый этап получает документ** в `docs/<область>/` с preflight и критериями проверки.
5. Секреты — только в `.env.local` / `.local-secrets` / GitHub Secrets. Никогда в код.

## 10. Команды

```bash
npm run dev                      # http://localhost:5173
npm run build                    # прод-билд (APP_BASE_PATH управляет base)
npm run supabase:local:bootstrap # локальная Supabase
npm run verify:<фича>            # ~140 проверочных скриптов, см. package.json
npx playwright test              # e2e
```

Переменные окружения: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_WEB_PUSH_VAPID_PUBLIC_KEY`, `VITE_CAREERS_ORIGIN`, `APP_BASE_PATH`.
