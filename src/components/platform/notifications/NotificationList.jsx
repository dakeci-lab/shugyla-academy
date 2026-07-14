import NotificationListItem from './NotificationListItem'
import { groupNotificationsByDate } from '../../../utils/notificationInboxUtils'

/** Список уведомлений с группировкой по дате */
export default function NotificationList({
  notifications,
  onItemClick,
  hasMore,
  loadingMore,
  onLoadMore,
}) {
  const groups = groupNotificationsByDate(notifications)

  return (
    <div className="notification-list">
      {groups.map((group) => (
        <section key={group.key} className="notification-list__group" aria-label={group.label}>
          <h3 className="notification-list__group-label">{group.label}</h3>
          {group.items.map((notification) => (
            <NotificationListItem
              key={notification.id}
              notification={notification}
              onClick={onItemClick}
            />
          ))}
        </section>
      ))}

      {hasMore && (
        <div className="notification-list__load-more">
          <button
            type="button"
            className="notification-list__load-more-btn"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      )}
    </div>
  )
}
