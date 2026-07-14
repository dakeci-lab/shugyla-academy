import { ClockIcon } from '../../icons/PlatformIcons'
import { isNotificationUnread } from '../../../services/inAppNotificationService'
import {
  formatNotificationTime,
  getModuleLabel,
} from '../../../utils/notificationInboxUtils'

const PRIORITY_LABELS = {
  high: 'Важно',
  urgent: 'Срочно',
}

function ModuleIcon({ moduleCode }) {
  if (moduleCode === 'time_tracker') {
    return <ClockIcon size={16} />
  }

  const label = getModuleLabel(moduleCode)
  return (
    <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 700 }}>
      {label.slice(0, 2).toUpperCase()}
    </span>
  )
}

/** Строка уведомления в списке */
export default function NotificationListItem({ notification, onClick }) {
  const unread = isNotificationUnread(notification)
  const priorityLabel = PRIORITY_LABELS[notification.priority] || null
  const showPriority = notification.priority === 'high' || notification.priority === 'urgent'

  return (
    <button
      type="button"
      className={[
        'notification-list-item',
        unread ? 'notification-list-item--unread' : 'notification-list-item--read',
        showPriority ? `notification-list-item--priority-${notification.priority}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onClick?.(notification)}
    >
      <span className="notification-list-item__dot" aria-hidden="true" />

      <span className="notification-list-item__icon">
        <ModuleIcon moduleCode={notification.module_code} />
      </span>

      <span className="notification-list-item__content">
        <span className="notification-list-item__header">
          <span className="notification-list-item__title">{notification.title}</span>
          <time className="notification-list-item__time" dateTime={notification.created_at}>
            {formatNotificationTime(notification.created_at)}
          </time>
        </span>

        <p className="notification-list-item__body">{notification.body}</p>

        <span className="notification-list-item__meta">
          <span className="notification-list-item__module">
            {getModuleLabel(notification.module_code)}
          </span>
          {showPriority && (
            <span
              className={`notification-list-item__priority notification-list-item__priority--${notification.priority}`}
            >
              {priorityLabel}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
