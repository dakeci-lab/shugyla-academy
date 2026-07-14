import './notifications.css'

/** Пустое состояние списка уведомлений */
export default function NotificationEmptyState() {
  return (
    <div className="notification-empty-state">
      <p className="notification-empty-state__title">У вас пока нет уведомлений</p>
      <p className="notification-empty-state__hint">
        Здесь будут появляться важные рабочие напоминания
      </p>
    </div>
  )
}
