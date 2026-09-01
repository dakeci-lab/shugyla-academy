# Документы сотрудника — доступ на запись для админов/владельца + удаление

## 0. Статус: реализовано, verify зелёный (23/23), build чистый, browser mount-тест подтвердил все 4 состояния кнопок

## 1. Проблема (репорт владельца)

Владелец, открыв карточку сотрудника → «Документы», видел «Документ ещё не
загружен» / «Нет файла» без какой-либо кнопки — загрузить документ за
сотрудника было невозможно. Также попросил добавить удаление/замену.

## 2. Причина — два независимых слоя, оба блокировали админа

**Слой 1 — фронтенд** (`src/pages/platform/PlatformEmployeeDocuments.jsx`):
```js
const canAccess = isOwn || canAdminView   // админ мог ЗАЙТИ на страницу
const canUpload = isOwn                   // но не мог загружать — жёстко только свои
```
`canAdminView` уже вычислялся (для доступа к просмотру), но не
использовался для `canUpload` — отсюда и симптом «вижу страницу, кнопки
нет».

**Слой 2 — RLS в БД**, который поймал бы это даже после фикса фронтенда:
в `20260718240000_employee_documents.sql` политики `insert`/`update` на
`employee_documents` и на `storage.objects` проверяли **только**
`auth_private.employee_owned_by_current_auth(employee_id)` — без обхода по
праву, в отличие от `select`-политики, которая уже разрешала `employees.view`
админам. То есть просто показать кнопку было бы недостаточно — реальная
загрузка от имени админа упала бы с ошибкой RLS.

**Удаление отсутствовало полностью** — ни сервисной функции, ни
`grant delete`, ни RLS-политики, ни для кого. Комментарий в коде прямо
говорил: «удаление/замена — позже» (`employeeDocumentService.js`).

## 3. Решение

- **Фронтенд**: `canUpload` → `canManage = isOwn || canEditEmployees(user)`
  (право `employees.edit` — тот же уровень, что уже используется в
  проекте для остальных редактируемых полей карточки сотрудника, не
  путать с более широким `employees.view`, которым просто разрешён
  просмотр).
- **Кнопка «Удалить»** — рядом с «Открыть», видна только при `canManage`;
  подтверждение через `ConfirmDialog` (тот же компонент, что и для
  остальных деструктивных действий в проекте).
- **Сервис**: новая `deleteEmployeeDocument(document)` в
  `employeeDocumentService.js` — удаляет строку метаданных, затем
  best-effort чистит файл в Storage.
- **Миграция БД** —
  [`20260901130000_employee_documents_admin_write_access.sql`](../../supabase/migrations/20260901130000_employee_documents_admin_write_access.sql):
  - `insert`/`update` политики на `employee_documents` — добавлен обход
    `current_user_has_permission('employees.edit')`, тем же паттерном, что
    уже был у `select`.
  - Новая `delete`-политика на `employee_documents` (свой ИЛИ
    `employees.edit`) + `grant delete`.
  - Те же три изменения зеркально для `storage.objects` (bucket
    `employee-documents`): insert/update получили обход по праву, добавлена
    delete-политика.
  - Правило «один файл на тип, повторная загрузка запрещена» в
    `uploadEmployeeDocument` не тронуто — теперь это и есть механизм
    «замены»: сначала «Удалить», потом «Загрузить» снова.

## 4. Verify

```bash
npm run verify:employee-documents
npm run build
```

Скрипт дополнен новым этапом «Admin write access» (6 новых проверок,
23/23 всего): миграция содержит обход по `employees.edit` на insert/update
(и таблицы, и Storage), delete-политики существуют (таблица + Storage),
сервисная функция удаления существует, страница больше не жёстко
завязана на `isOwn`.

Дополнительно — browser mount-тест `DocumentRow` (временный экспорт,
возвращён обратно после теста) на всех 4 комбинациях
`canManage × uploaded`: «Нет файла» (нет прав, пусто) / «Загрузить» (есть
права, пусто) / «Открыть» (нет прав, загружено) / «Открыть» + «Удалить»
(есть права, загружено) — все рендерятся корректно, ошибок нет.

## 5. Затронутые файлы

Изменены: `src/pages/platform/PlatformEmployeeDocuments.jsx`,
`src/pages/platform/PlatformEmployeeDocuments.css`,
`src/services/employeeDocumentService.js`,
`scripts/verify-employee-documents.mjs`.

Новое: `supabase/migrations/20260901130000_employee_documents_admin_write_access.sql`,
этот файл.

Не тронуто: Edge Functions — фича полностью клиент-Storage, серверной
функции для документов нет и не было.
