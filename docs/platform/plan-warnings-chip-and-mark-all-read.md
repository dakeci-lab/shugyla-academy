# План: убрать chip «Предупреждения» + web «Прочитать всё»

**Статус:** PR A и PR B реализованы (verify — прогнать; коммит/PR — по команде владельца).  
**Дата:** 2026-08-21.  
**Формат:** два узких PR — **A** Planning UI → **B** NotificationPanel mark-all-read. Без новых UI-lib, без Edge/SQL.

Находки (read-only):

| Тема | Где |
|------|-----|
| Chip «Предупреждения» | `ProcurementPlannerView.jsx` toolbar: toggle `filters.warningsOnly` |
| `warningsOnly` → leaf | `buildPlannerItemsScopeKey`, tree reset deps, `fetchSnapshotItemsPage` / `applySnapshotItemsPageQuery` → `.eq('negative_stock', true)` |
| UMAG strip «N отриц.» | `buildSnapshotHeadline` → `.proc-planner__snapshot-warn` — **не** кнопка фильтр |
| Alert chips | `getPlannerAlertChips` / `handleAlertChipClick` — «Без поставщика» / «Расхождения» |
| Verify chip | `verify-procurement-planner-header.mjs`, `verify-procurement-planner-tree.mjs` assert «Предупреждения» |
| Mobile mark-all | `PlatformNotificationsInbox.jsx`: `CheckCheckIcon`, `markAllAsRead`, disabled при `unreadCount <= 0` |
| Context / API | `NotificationInboxContext.markAllAsRead` → `markAllNotificationsRead()` → RPC `mark_all_notifications_read` (+ per-item fallback) |
| Web panel | `NotificationPanel.jsx` → `PanelHeader`: push toggle + refresh; **нет** mark-all |

---

## Цель и non-goals

### Цель

1. **A:** Убрать с экрана Planning кнопку/chip «Предупреждения» (пользователь не может включить `warningsOnly` из UI).  
2. **B:** В web-панели «Уведомления» дать тот же mark-all-read, что на mobile inbox.

### Non-goals

- Удалять `warningsOnly` из service / scope key / state (можно оставить мёртвым для API совместимости).  
- Трогать UMAG strip «N отриц.» и alert chips.  
- Новый RPC / Edge; второй backend path.  
- Менять mobile inbox (уже есть ✓✓).  
- Новые UI-библиотеки / Tailwind.  
- Смешивать A и B в одном PR реализации.

---

## PR A — Убрать chip «Предупреждения»

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:procurement-planner-header`, `npm run verify:procurement-planner-tree`.

**Ветка (рекомендация):** `cursor/planner-remove-warnings-chip`  
**Зависимости:** нет.

### Чеклист

| # | Действие | Деталь |
|---|----------|--------|
| 1 | Удалить JSX toolbar button | Блок с label «Предупреждения» / `warningsOnly: !current.warningsOnly` |
| 2 | Оставить | `filters.warningsOnly` в initial state (false); service `.eq('negative_stock')`; scope key; tree reset на смену флага (мертвый путь ок) |
| 3 | Не трогать | `.proc-planner__snapshot-warn`, alert chips, orderable chip |
| 4 | Verify | Убрать asserts «Предупреждения» из header/tree; вместо — assert **нет** строки `Предупреждения` в planner JSX |

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `src/components/procurement/ProcurementPlannerView.jsx` | снос кнопки |
| `scripts/verify-procurement-planner-header.mjs` | assert absence |
| `scripts/verify-procurement-planner-tree.mjs` | assert absence (сейчас require presence) |
| `docs/platform/plan-warnings-chip-and-mark-all-read.md` | статус A |

### Verify + приёмка A

```bash
npm run verify:procurement-planner-header
npm run verify:procurement-planner-tree
# регресс: weeks / pagination / desktop по желанию
```

**Ручные:** в Planning нет chip «Предупреждения»; UMAG «N отриц.» и «Только к заказу» на месте.

---

## PR B — Web «Прочитать всё»

**Статус этапа:** реализация сделана, готово к ревью.  
**Verify:** `npm run verify:notification-panel-mark-all-read`.

**Ветка (рекомендация):** `cursor/web-notifications-mark-all-read`  
**База:** независим от A (можно параллельно после плана).  
**API:** переиспользовать `useNotificationInbox().markAllAsRead` (уже в контексте).

### UX

| Элемент | Деталь |
|---------|--------|
| Место | `PanelHeader` в `NotificationPanel.jsx` — рядом с refresh (иконка ✓✓ как mobile) |
| Иконка | `CheckCheckIcon` из `PlatformIcons` |
| a11y | `aria-label` / `title` = «Прочитать все» |
| Disabled | `unreadCount <= 0` или идёт запрос (`markingAll`) |
| Поведение | optimistic уже в context; toast при ошибке уже есть |
| Desktop + mobile sheet | Одна кнопка в shared `PanelHeader` — web dropdown и mobile bottom sheet панели оба получают mark-all (mobile full-page inbox уже имеет свой ✓✓ — дубль на sheet ок / согласованно) |

Не изобретать второй service: только wiring UI → `markAllAsRead`.

### Файлы (ожидаемые)

| Файл | Что |
|------|-----|
| `src/components/platform/notifications/NotificationPanel.jsx` | кнопка в `PanelHeader`; state `markingAll`; прокинуть `markAllAsRead` / `unreadCount` |
| `src/components/platform/notifications/notifications.css` | при необходимости стиль (скорее reuse `__icon-btn`) |
| `scripts/verify-*-notifications*.mjs` (новый или расширить foundation/UI) | assert `CheckCheckIcon` / «Прочитать все» / `markAllAsRead` в panel |
| `package.json` | если новый script |
| этот plan-док | статус B |

### Verify + приёмка B

```bash
npm run verify:notification-panel-mark-all-read
# регресс: verify-notification-foundation или loading-system если затронут
```

**Ручные:**

1. Web: открыть колокол → «Уведомления» → ✓✓ при unread > 0.  
2. Клик → badge/unread → 0; список без unread.  
3. При 0 unread кнопка disabled.  
4. Mobile full-page inbox по-прежнему работает.

---

## Порядок выкладки

```text
PR A (убрать Предупреждения) → verify → merge по команде
PR B (web mark-all-read)     → verify → merge по команде
```

- Можно **параллельно** (нет общей зависимости кода).  
- Не смешивать в одном PR.  
- Коммит/push — только по команде владельца.

Ориентир сообщений:

```text
fix(procurement): remove planner warnings toolbar chip
feat(notifications): add mark-all-read to web notification panel
```

---

## Закрытые решения

1. Chip «Предупреждения» — **убрать из UI**; backend `warningsOnly` можно оставить.  
2. Strip «N отриц.» / alert chips — **не трогать**.  
3. Web mark-all — **reuse** `markAllAsRead` / RPC; UI как mobile ✓✓.  
4. Два PR: A и B раздельно.

---

## Preflight исполнителя

1. Прочитать этот план.  
2. Дифф только по файлам этапа.  
3. Прогнать verify этапа.  
4. Не коммитить, пока владелец не попросит.
