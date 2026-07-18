import { useEffect, useMemo, useState } from 'react'
import { CheckCheckIcon } from '../../components/icons/PlatformIcons'
import NotificationEmptyState from '../../components/platform/notifications/NotificationEmptyState'
import NotificationList from '../../components/platform/notifications/NotificationList'
import PushNotificationToggle from '../../components/platform/notifications/PushNotificationToggle'
import '../../components/platform/notifications/notifications.css'
import { useNotificationInbox } from '../../context/NotificationInboxContext'
import { usePlatformPageTitle } from '../../context/PlatformPageTitleContext'
import './PlatformNotificationsInbox.css'

function InboxSkeleton() {
  return (
    <div className="notifications-inbox__skeleton" aria-hidden="true">
      <div className="notifications-inbox__skeleton-row" />
      <div className="notifications-inbox__skeleton-row" />
      <div className="notifications-inbox__skeleton-row" />
    </div>
  )
}

/** Полноэкранная лента уведомлений (mobile PWA) */
export default function PlatformNotificationsInbox() {
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    error,
    offline,
    hasMore,
    canUseInbox,
    refreshNotifications,
    loadMore,
    markAllAsRead,
    handleNotificationClick,
  } = useNotificationInbox()

  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    if (!canUseInbox) return
    void refreshNotifications()
  }, [canUseInbox, refreshNotifications])

  const headerActions = useMemo(
    () => (
      <div className="notifications-inbox__header-actions">
        <PushNotificationToggle />
        <button
          type="button"
          className="platform-mobile-header__icon-btn"
          aria-label="Прочитать все"
          title="Прочитать все"
          disabled={markingAll || unreadCount <= 0}
          onClick={() => {
            if (markingAll || unreadCount <= 0) return
            setMarkingAll(true)
            void markAllAsRead().finally(() => setMarkingAll(false))
          }}
        >
          <CheckCheckIcon size={18} />
        </button>
      </div>
    ),
    [markAllAsRead, markingAll, unreadCount]
  )

  usePlatformPageTitle('Уведомления', 'Лента уведомлений платформы.', {
    actions: headerActions,
  })

  let body = null

  if (!canUseInbox) {
    body = (
      <div className="notifications-inbox__state">
        <p>Войдите, чтобы видеть уведомления</p>
      </div>
    )
  } else if (loading && notifications.length === 0) {
    body = <InboxSkeleton />
  } else if (offline && notifications.length === 0) {
    body = (
      <div className="notifications-inbox__state">
        <p>Нет подключения к интернету</p>
        <button type="button" className="notifications-inbox__retry" onClick={refreshNotifications}>
          Повторить
        </button>
      </div>
    )
  } else if (error && notifications.length === 0) {
    body = (
      <div className="notifications-inbox__state">
        <p>Не удалось загрузить уведомления</p>
        <button type="button" className="notifications-inbox__retry" onClick={refreshNotifications}>
          Повторить
        </button>
      </div>
    )
  } else if (!loading && notifications.length === 0) {
    body = <NotificationEmptyState />
  } else {
    body = (
      <NotificationList
        notifications={notifications}
        onItemClick={handleNotificationClick}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    )
  }

  return <div className="notifications-inbox">{body}</div>
}
