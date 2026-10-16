# Stage 12 — hide personnel modules (platform = procurement + settlements only)

**Decision (owner, 2026-10-16):** the platform is used only for procurement and supplier
settlements. Attendance is tracked in Propolis, the careers site and its old candidates are
not used. Personnel modules are **hidden, not deleted** — code and data stay for now.

## Scope

Frontend + one production cron switch. **No migrations, no code deletion, no table changes.**

| Hidden | Kept |
|---|---|
| Home (time tracker / owner dashboard), График работы, Подсчёт зарплаты, HR (вакансии, кандидаты), документы и профиль сотрудника, настройки тайм-трекера, настройки уведомлений, колокольчик и лента уведомлений, device-permission onboarding, careers site (`jobs.*`, `/vacancies`, `/apply`) | Главная (бывшие «Продажи»), Закуп, Заказы, Расчёты, Счета оплаты, Роли и доступы, Профиль, **Пользователи** (новый пункт в Настройках) |

## Behavior

- **Entry (`/platform`)** has no page of its own: every role opens its first allowed section —
  admin → «Главная» (`/platform/sales`), buyer → «Закуп», receiver → «Заказы».
- **Roles with no sections** (cashier, seller, floor admin) get `PlatformNoAccess` with an
  explanation instead of an empty screen.
- **«Пользователи»** (`/platform/settings/users`) = the old employees list (create, role,
  disable). It no longer links to the hidden employee profile. Route key and permission are the
  existing `EMPLOYEES_LIST` (admin).
- **Redirects** (to `/platform`): `/platform/notifications`, `/time-tracker`, `/employees/*`,
  `/hr/*`, `/settings/general`, `/settings/notifications`. `/platform/employees` and
  `/employees/list` → `/platform/settings/users`.
- **Careers**: all careers hosts/routes redirect to `https://shugyla-market.kz`; locally to login.
  The corporate page no longer links to vacancies.
- **Less load**: no `notifications` queries/realtime (provider not mounted), recruitment is not
  prefetched or reloaded, the employees module is loaded only on «Пользователи».

## Production change (outside git) — 2026-10-16

The per-minute time-tracker scheduler was **disabled** (it keeps querying the DB and sending
pushes even with the UI hidden):

```sql
select cron.alter_job(2, active := false);  -- time-tracker-notification-scheduler-every-minute
```

Rollback:

```sql
select cron.alter_job(2, active := true);
```

Other cron jobs (procurement sync 07:00, procurement archive 07:30) are untouched.

## Known limits / not done

- Edge functions, tables, RLS and all personnel code are still deployed. Public careers intake
  policies in the DB are untouched until the DB stage.
- `academy_users` and RBAC stay: login, roles and «who marked paid» depend on them.
- Role access is permission-first from the DB; `verify:hide-personnel-modules` checks the role
  fallback logic, so confirm real accounts after deploy (checklist below).

## Verification

- `npm run verify:hide-personnel-modules` — 43 checks (menu, role landing via the real nav code,
  redirects, providers, data loading).
- Eight older verify scripts asserted the now-hidden behavior and were updated to assert the
  hidden state (`device-permissions-onboarding`, `domain-deployment`, `employee-documents`,
  `notification-settings-admin`, `public-route-isolation`, `recruitment-public-careers-ui`,
  `salary-payroll-mvp`; `host-surfaces` shares `domain-deployment`).
- Full `verify:*` run: no new failures versus `main` (41 scripts already failed on `main`).
- `npm run build` ok.

## Manual check after deploy

1. Admin: menu = Главная, Закупки, Финансы, Настройки; `/platform` opens «Главная».
2. Buyer: lands on «Закуп»; receiver on «Заказы».
3. Cashier/seller/floor admin: «Для вашей роли здесь нет разделов».
4. Настройки → Пользователи: create / change role / disable a user.
5. Old links `/platform/employees/…`, `/platform/hr/…`, `jobs.shugyla-market.kz` land on a
   sensible page.
6. No push permission prompt, no bell in the header.
