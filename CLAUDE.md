# CLAUDE.md — контекст проекта Shugyla

> Опись проекта для AI-агентов. Обновлять при смене архитектуры, домена или этапа работ.
> Дата составления: 2026-10-17, обновлено 2026-10-22. Основная ветка: `main`.

## 1. Что это

Внутренняя платформа **Shugyla Market** (Актобе, KZ) для **закупа и взаиморасчётов с поставщиками**.
Историческое имя репозитория (`shugyla-academy`) осталось от обучающей платформы; academy давно удалена.

С октября 2026 платформа сведена **только к закупу и взаиморасчётам** (решение владельца):
тайм-трекер, график, зарплата, HR/рекрутинг, сайт вакансий и уведомления **удалены** (этапы 12–14,
см. `docs/platform/stage-12-*.md`, `stage-13-cleanup.md`, `stage-14-polish.md`). Учёт рабочего времени
владелец ведёт во внешней системе **Прополис**. Не возвращать удалённое без явного решения владельца.

Источник данных — **UMAG** (`api.umag.kz`), система автоматизации магазина. Данные тянутся через Supabase
Edge Functions и складываются в собственные таблицы Postgres.

## 2. Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 19 + Vite 6 + React Router 7, чистый CSS (без UI-библиотек) |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions на Deno/TypeScript) |
| Прод-хостинг | PS.kz / Plesk — деплой артефактом в ветку `ps-production` через GitHub Actions |
| CI | GitHub Actions: `deploy-ps-production.yml` (сборка + `verify:domain-deployment` + публикация артефакта) |
| Тесты | 97 самописных `verify:*` node-скриптов в `scripts/` (96 проходят, см. §8) |
| Прочее | PWA (sw.js, manifest), xlsx, pdfmake, qrcode |

Зависимости намеренно минимальны — нет TypeScript на фронте, нет state-библиотек, нет Tailwind.
Не вводить новые зависимости без обсуждения.

## 3. Домены

`src/router/hostSurface.js` определяет поверхность по hostname:

| Домен | Поверхность | Содержимое |
|-------|-------------|-----------|
| `web.shugyla-market.kz` | PLATFORM | внутренняя платформа `/platform/*` |
| `shugyla-market.kz` | CORPORATE | корпоративная заглушка (`CorporateHome`) |
| `jobs.shugyla-market.kz` | CAREERS (закрыт) | всё редиректит на корпоративный сайт |
| `localhost`, `dakeci-lab.github.io` | COMBINED | dev + легаси |

## 4. Разделы платформы (`/platform/*`)

Меню (`src/platform/platformNav.js`):

- **Главная** (`/platform/sales`, бывшие «Продажи»; право `sales.view`, по умолчанию администратор) — выручка и маржа, синк продаж UMAG
- **Закупки**: Закуп (`/procurement` — список документов закупа: заказы поставщикам создаются вручную кнопкой «＋ Создать»; документ — `/procurement/documents/:id`), Заказы (`/orders` — для приёмщика: только сохранённые заказы, документ только для чтения с галочками и «Сверено»), Расчёты (`/supplier-finance`: одна страница — список поставщиков с балансом; в карточке поставщика история операций, где оплачиваются накладные и отмечаются полученные возвраты), Склад (`/warehouse`)
- **Финансы**: Счета оплаты (`/finance/payment-accounts`)
- **Настройки**: Пользователи (`/settings/users`), Роли и доступы (`/settings/roles`)
- Профиль (`/profile`)

`/platform` сам по себе не имеет страницы: `PlatformIndex` отправляет роль в первый доступный раздел
(админ → Главная, закупщик → Закуп, приёмщик → Заказы). Роли без разделов видят `PlatformNoAccess`.
Роли в БД: `admin` (Директор), `buyer` (закупщик), `receiver` (приёмщик), `buhgalter` (бухгалтер); пользователей 4, по одному на роль.

Отметка оплаты поставщику — **только в платформе** (`platform_paid_at` в `supplier_payment_obligations`);
`current_debt` из UMAG по политике владельца всегда ~0 и не используется как признак оплаты.
То же для возвратов поставщику: «деньги получены» — `platform_refunded_at` в `umag_supply_returns`
(`payed_amount` из UMAG не используется; этап 20, `docs/db/stage-20-returns-refund-marking/`).
Накладные (деньги уходят) и возвраты (деньги приходят) ведутся раздельно, **без взаимозачёта**.
Права: оплата/получение — `supplier_payments.manage`; отметки ставятся в окне операции в истории поставщика.
В истории поставщика: оплата накладных пачкой (галочки + «Оплатить выбранные», счёт подставляется из поставщика), «Просрочено» (по `due_date`:
чип в списке и в истории, «просрочено на N дн.» у документа, «из них просрочено X» в шапке карточки).
Накладные без выбранного поставщика (`platform_supplier_id IS NULL`, например неоформленная приёмка)
показываются виртуальной строкой «Поставщик не выбран» (`UNASSIGNED_SUPPLIER_ID`), чтобы итог списка
всегда равнялся сумме неоплаченных накладных; после выбора поставщика в UMAG и синка накладная переходит к нему.

## 5. Архитектура данных

**Adapter pattern.** Домены закупа/поставщиков/приёмки имеют `*LocalAdapter.js` (localStorage,
демо/офлайн) и `*SupabaseAdapter.js` (прод). Выбор через `src/lib/dataMode.js` (`isCloudMode`).
Оркестратор — `src/services/platformDataService.js`. Точечные записи (например поставщик) патчат
кэш, а не вызывают полный `refreshData()`.

**Кэш в памяти** — `src/lib/cloudStore.js`: модули `employees`, `suppliers`, `procurement`, `receiving`
(`markModuleLoading/Ready/Error`, `ensureModuleLoaded`). Оболочка рендерится после Auth+RBAC, модули
догружаются лениво по маршруту (`getRouteCriticalModules`); `employees` нужен только экрану «Пользователи».
Длинные списки грузятся пачками с ограниченным параллелизмом (`fetchAllRowsByIdChunks`).

**React-контексты** (`src/context/`): Session, PlatformData, Permission (RBAC), Language, PullToRefresh,
Toast, PlatformPageTitle.

**RBAC** — гибкий, в БД (`roles`, `permissions`, `role_permissions`); UI «Роли и доступы» строится из
`PERMISSION_CATALOG` (`src/config/permissionCatalog.js`). Проверки прав — на фронте (`PermissionContext`),
в Edge Functions (`_shared/employeeAuthorization.ts`) и в RLS. Права строкой вида `umag.settlements.sync`.
`academy_users` — учётные записи (логин, роль, «кто отметил оплату»); таблица остаётся основой авторизации.

## 6. Edge Functions (`supabase/functions/`, всего 10)

UMAG / закуп (креды UMAG **никогда** не уходят на клиент — `_shared/umagAuth.ts`, секреты
`UMAG_LOGIN`/`UMAG_PASSWORD`/`UMAG_STORE_ID` в Supabase → Edge Functions → Secrets):
`umag-sync` (поставщики, поставки, возвраты, платежи, обязательства), `umag-procurement`,
`umag-operation-details`, `umag-sales-sync`, `procurement-archive`.

Аккаунты (для «Пользователи»): `admin-create-employee`, `admin-update-employee`, `admin-list-employees`,
`admin-reset-employee-password`, `admin-check-employee-login`.

Задачи по расписанию (`pg_cron`): `procurement-sync-scheduler-daily-0700-aqtobe`,
`procurement-archive-scheduler-daily-0730-aqtobe`. Деплой функции: `npx supabase functions deploy <name>
--project-ref cxadzerxndlscwvdaymk --use-api` (CLI через `npx`, авторизован у владельца; Docker не нужен).
Без локальной машины: GitHub Actions → «Deploy Supabase Edge Functions» (ручной запуск, параметр `functions`:
имена через пробел или `all`); нужен секрет репозитория `SUPABASE_ACCESS_TOKEN` (личный токен Supabase).
Функции **не** деплоятся слиянием в `main` — после слияния правки в `supabase/functions/` запустить этот workflow.

## 7. База данных

Проект Supabase prod: `cxadzerxndlscwvdaymk` (staging `iutrhweudmythmwbtzid` — на паузе).
`supabase/migrations/` — файлы с таймстампом или описательными именами (имя в репозитории может
отличаться от версии, записанной Supabase при применении через MCP). Миграции **не** применяются
GitHub Actions — только вручную/через MCP.

Крупные операции с БД — «этапы» с preflight / apply / postcheck / report: эталоны
`docs/db/stage-7a-academy-learning-removal/` и `docs/db/stage-13d-personnel-tables-removal/`.
**Урок stage 13d:** preflight должен проверять не только таблицы, представления, политики и триггеры,
но и **код Edge Functions и фронтенда** (`grep` по `.from('<таблица>')`/`rpc('<функция>')`) — после
удаления таблицы смен «Отключить сотрудника» сломалось, пока не убрали очистку графика из
`admin-update-employee`. Удаления делать без `CASCADE` и без `IF EXISTS`, одной транзакцией.

## 8. Состояние и что осталось

Сделано (октябрь 2026): гигиена загрузки (прогрессивный bootstrap, параллельные пачки позиций закупа,
точечные записи вместо полной перезагрузки, throttle повторных загрузок закупа), отключён лишний
планировщик, удалены персонал/HR/рекрутинг/вакансии/уведомления (код, функции, таблицы, бакеты, права),
закрыт анонимный приём заявок и анонимная запись в аватары.

**Закуп как документы (этапы 1–8, 2026-10-29; `docs/procurement/purchase-documents/`):** статусы заказа `draft`/`saved`, номер при сохранении (с 1001, триггер), документ с автосохранением правок,
окна «Товары поставщика» (таблица планирования по поставщику, панель плана, кнопка обновления данных UMAG) и «Добавить из номенклатуры» (последний снимок UMAG, ~8,6 тыс. SKU; полный каталог UMAG 27,7 тыс. — возможный отдельный этап).
Приёмку (receiving) и «нормы/ABC» из интерфейса и БД убрали. Старый планировщик ещё доступен по `/procurement/plan` на переходный период; после него удалить `ProcurementPage`/`ProcurementPlannerView`,
`generate_procurement_orders_from_snapshot` и правку итогового количества в снимке (удаления в БД выполняет владелец в SQL Editor; перед удалением — поиск по телам функций, урок stage 25c).

Остаётся (`docs/platform/stage-14-polish.md`):
- `verify:*`: из 97 проходят 96; `auth-first-frontend-production-readiness` требует локальную Supabase (Docker).
  Новые проверки писать через `scripts/lib/extensionlessResolver.mjs` (реальные модули, не регулярки).
- Лишние колонки `academy_users` (этап 18) и `password` + таблица `platform_work_locations` (этап 19) удалены.
  Пароли, лежавшие открытым текстом, считать скомпрометированными — сбросить через «Сбросить пароль».
- «Заказы» (приёмщик): без аналитики закупщика, без авто-комментария (этап 21), галочки сверки по строкам помнятся в браузере
  (`orderChecklistStorage`, 30 дней, в БД не пишутся), сводка над списком («Сегодня ждём N поставок, M товаров»), общая отметка «Сверено»
  на заказе (этап 22: `purchase_orders.checked_at/checked_by_name`, ставит роль с `receiving.view`, снимается при возврате в черновик).
- Визуальная проверка без локальной машины: Playwright + замоканный Supabase поверх `vite` (скрипты живут в scratchpad сессии, в репозиторий не входят).
- **Закуп по графику поставщика (этап 23, 2026-10-25):** цель запаса = (дата доставки − сегодня) + цикл до следующей поставки + страховые дни
  (по умолчанию 1; на заказ можно менять и «пропускать визит» = + цикл). Дни — `order_days` (заказ/визит) и `delivery_days` (срок) в карточке поставщика;
  без дней — цикл 7 дней с пометкой «дни не заполнены». «В пути» — заказы не отменённые/не принятые с датой доставки ≥ сегодня (приёмка по статусам не ведётся).
  Считает БД: `procurement_apply_plan` (триггер при `ready` снимке + RPC `procurement_plan_supplier` из панели плана), статус — колонка `plan_status`.
  **Нормы и ABC удалены полностью** (этап 24, 2026-10-25): из интерфейса, из функций `umag-procurement` / `procurement-archive` (задеплоены), из БД (таблицы норм, функции, колонки
  `norm_days` / `reserve_status` / `abc_*`, право `procurement.norms.manage`). Копия 100 правил норм — `docs/procurement/visit-days-redesign/`. План считает БД
  (`procurement_apply_plan`) **вне** оператора «снимок готов» — у API лимит 8 с: cron `procurement-ensure-plan-every-minute` + вызов планировщика после ручной синхронизации
  (RPC `procurement_ensure_plan`); колонка статуса — `plan_status`. `drop` через MCP требует интерактивного подтверждения, которое не доходит: такие операции выполняет
  владелец в Supabase → SQL Editor. Документы: `docs/procurement/visit-days-redesign/`, `docs/db/stage-23-visit-plan/`, `docs/db/stage-24-remove-norms-and-abc/`.
  Осталось: усреднение продаж с весом последних недель; дни у 133 поставщиков заполняет закупщик (список в Google Drive и `suppliers-to-fill.md`).
- Ускорение синка «Расчётов» (`umag-sync`) выкачено 2026-10-23: 25–29 с вместо 46–53 с. Синк «Расчётов» по расписанию не запускается (только кнопка);
  ночная задача 07:00 синхронизирует только закуп (`umag-procurement`).
- Вкладка «К оплате» удалена (2026-10-22): оплата — в истории операций карточки поставщика. Сроки оплаты
  (`due_date`) по-прежнему считаются, но нигде не показываются.
- Должности и группы должностей удалены (этап 17, `docs/platform/stage-17-remove-positions.md`): остаётся только роль.

**Масштаб использования:** платформой пользуются несколько человек (владелец, закупщик, приёмщик,
бухгалтер). Любой рефакторинг — аккуратно: это рабочий инструмент.

## 9. Процесс работы

Роли: пользователь (Данияр, владелец бизнеса) ставит цель → **Claude** проектирует, пишет код, гоняет
проверки, открывает PR → владелец проверяет в браузере. Ранее исполнителем был Cursor, бригадиром —
ChatGPT Codex (отсюда ветки `codex/*`, `cursor/*`).
Ветки: `main`, `agent/*`; артефакт-ветка `ps-production` (не трогать вручную).

Правила, выведенные из истории проекта:

1. **Один PR = одно направление.** Не смешивать frontend-фикс + контракт Edge + RLS.
2. **Сначала замер, потом оптимизация** (логи Supabase `edge_logs`, baseline-документ).
3. **Каждая фича получает `verify:*` скрипт** и запись в `package.json`.
4. **Каждый этап получает документ** в `docs/<область>/` с критериями проверки и откатом.
5. Секреты — только в `.env.local` / `.local-secrets` / GitHub Secrets / Supabase Secrets. Никогда в код.
6. **Деплой фронта = слияние в `main`.** Между двумя слияниями дожидаться завершения деплоя
   (`gh run list --workflow deploy-ps-production.yml`): два быстрых слияния подряд могут затереть
   сборку (случилось 2026-10-14). После деплоя сверять `https://web.shugyla-market.kz/version.json`.
7. Перед слиянием прогонять полный набор `verify:*` и сравнивать с базой «уже падали».

## 10. Команды

```bash
npm run dev                      # http://localhost:5173
npm run build                    # прод-билд (APP_BASE_PATH управляет base)
npm run verify:<фича>            # проверочные скрипты, см. package.json
npm run supabase:local:bootstrap # локальная Supabase (песочница, полностью не пересобирается)
```

Переменные окружения: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CAREERS_ORIGIN`, `APP_BASE_PATH`.

Документация: `docs/<область>/`; устаревшее по удалённым модулям — `docs/archive/`.
