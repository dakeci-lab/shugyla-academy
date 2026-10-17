# In-App Notification Center (Frontend)

Первый пользовательский слой системы уведомлений Shugyla Platform: колокольчик в шапке, счётчик непрочитанных, панель списка и отметка прочитанного через RPC `mark_notification_read`.

> База данных и RPC описаны в [database-foundation.md](./database-foundation.md).

## 1. Назначение

Центр показывает **постоянные in-app уведомления** текущего пользователя из таблицы `public.notifications`. Это не toast-система (`notificationService.js`).

Web Push (browser/system notifications) описан отдельно: [web-push-foundation.md](./web-push-foundation.md).

## 2. Компоненты

| Путь | Назначение |
|------|------------|
| `src/components/platform/notifications/NotificationBell.jsx` | Кнопка-колокольчик, badge, открытие панели |
| `src/components/platform/notifications/NotificationPanel.jsx` | Desktop dropdown / mobile bottom sheet |
| `src/components/platform/notifications/NotificationList.jsx` | Группированный список |
| `src/components/platform/notifications/NotificationListItem.jsx` | Строка уведомления |
| `src/components/platform/notifications/NotificationEmptyState.jsx` | Пустое состояние |
| `src/components/platform/PlatformHeaderActions.jsx` | Колокольчик + меню пользователя в шапке |
| `src/components/platform/notifications/notifications.css` | Стили центра уведомлений |

Provider подключён в `src/App.jsx` внутри `BrowserRouter` и `ToastProvider`.

## 3. Service API (`inAppNotificationService.js`)

### `loadNotifications({ limit, offset, unreadOnly })`

- Страница по умолчанию: 20
- Сортировка: `created_at DESC`
- Исключает истёкшие: `expires_at IS NULL OR expires_at > now()`
- Не передаёт `employee_id` — только RLS
- Возвращает `{ items, hasMore, error?, offline? }`

### `loadUnreadNotificationCount()`

- Точный `count` через PostgREST (`head: true`)
- Условия: `read_at IS NULL` и не истекло

### `markNotificationRead(notificationId)`

```javascript
await supabase.rpc('mark_notification_read', {
  p_notification_id: notificationId,
})
```

- Только RPC, без `.from('notifications').update()`
- Успех: `data === true`

### `validateNotificationActionUrl(actionUrl)`

Разрешены только внутренние пути:

- начинаются с `/`
- не начинаются с `//`
- не `http://`, `https://`, `javascript:`, `data:`

При некорректном URL возвращает `null`.

## 4. Context API (`NotificationInboxContext.jsx`)

### Состояние

- `notifications`, `unreadCount`, `loading`, `loadingMore`
- `error`, `offline`, `hasMore`, `panelOpen`, `initialized`
- `canUseInbox` — `supabaseAuthenticated && authenticated`

### Методы

- `openPanel`, `closePanel`, `togglePanel`
- `refreshNotifications`, `loadMore`
- `markAsRead(notificationId)`
- `handleNotificationClick(notification)` — mark + navigate
- `resetNotificationState()` — при logout / смене пользователя

### Auth lifecycle

Inbox requires an **Auth-first Supabase session** in cloud mode (`supabaseAuthenticated === true`). See [Auth-first login](../auth/auth-first-login.md).

1. Запросы не выполняются, пока `authStatus === loading`
2. Legacy-сессия без Supabase Auth — колокольчик скрыт, запросов нет
3. После Supabase Auth — загрузка `unreadCount`
4. Полный список — при первом открытии панели, refresh, возврате вкладки (если данные старше 60 с)

### Optimistic mark-as-read

1. Уже прочитанное — RPC не вызывается
2. Unread — локально `read_at`, `unreadCount - 1`, затем RPC
3. Ошибка RPC — rollback + toast «Не удалось отметить уведомление прочитанным»

## 5. Unread

- **unread**: `read_at === null`
- **read**: `read_at !== null`
- Поле `status` при прочтении не меняется

## 6. RPC `mark_notification_read`

Frontend вызывает только публичную обёртку:

```javascript
supabase.rpc('mark_notification_read', { p_notification_id: uuid })
```

RPC idempotent, меняет только `read_at` для собственной строки.

## 7. Почему нет прямого UPDATE

- `authenticated` имеет только `SELECT` на `notifications`
- RLS не даёт UPDATE
- Единственный безопасный путь — проверенный SECURITY DEFINER internal + INVOKER wrapper

## 8. Правила `action_url`

- Хранится без Vite base path (например `/platform/time-tracker`)
- React Router `navigate(actionUrl)` с basename `/shugyla-academy/`
- Внешние URL блокируются `validateNotificationActionUrl`
- HTML в body не рендерится

## 9. Desktop

- Popover под колокольчиком (~400px, max-height 70vh)
- Закрытие: click outside, Escape
- Колокольчик в `platform-layout__topbar` рядом с профилем

## 10. Mobile / PWA

- Bottom sheet через portal
- Safe-area padding, overlay, кнопка закрытия
- Колокольчик в `PlatformMobileHeader` рядом с аватаром
- Только один экземпляр панели активен (variant desktop/mobile)

## 11. UI states

| State | Поведение |
|-------|-----------|
| Loading | Skeleton, без ложного empty |
| Empty | «У вас пока нет уведомлений» |
| Error | Компактное сообщение + «Повторить» |
| Offline | «Нет подключения к интернету», список сохраняется |
| Load more | Кнопка «Показать ещё» |

## 12. Почему Realtime пока не используется

Обновление через: initial count, открытие панели, refresh, visibility, optimistic RPC. Realtime будет добавлен вместе с backend dispatcher.

## 13. Локальный runtime-тест

```bash
npx supabase status          # API/DB/Studio = 127.0.0.1
npm run supabase:local:verify-notifications
node scripts/local-inapp-notification-ui-fixture.mjs --setup
# dev-сервер с локальными env (не менять .env.local):
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<local anon> npm run dev
node scripts/local-inapp-notification-ui-fixture.mjs --cleanup
```

Fixture создаёт временного auth user, `academy_users` и 5–8 notifications. Service key только в памяти скрипта.

## 15. Manual desktop acceptance

**Дата:** 2026-07-13 (локальный Supabase, desktop browser).

| Проверка | Результат |
|----------|-----------|
| Login | **passed** |
| NotificationBell в header | **passed** |
| Начальный badge = 6 | **passed** |
| Panel open/close | **passed** |
| Группировка (Сегодня / Вчера / Ранее) | **passed** |
| Read/unread стили | **passed** |
| Длинный текст (layout) | **passed** |
| Mark read (RPC) | **passed** |
| Badge decrement (6 → 5 → 4 → 3 → 2) | **passed** |
| Persistence `read_at` | **passed** (подтверждено последовательным уменьшением badge) |
| Action navigation | **passed** |
| Fixture shift loading | **not applicable** — fixture-пользователь не имеет смены в `academy_employee_shifts` |
| Mobile bottom sheet | **pending** |
| Logout reset | **pending** |
| Console/Network (полная инспекция) | **pending** |

Production Supabase не использовался. Временные credentials и ключи в документ не включены.

## 16. Не реализовано на этом этапе

- Web Push, VAPID, service worker push
- Edge Functions, Cron, dispatcher
- Realtime subscription
- «Прочитать все», удаление, фильтры, настройки push
- Включение `notification_rules`
- Тайм-трекер dispatcher
