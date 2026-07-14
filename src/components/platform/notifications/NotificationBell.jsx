import { useRef } from 'react'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { BellIcon } from '../../icons/PlatformIcons'
import { useNotificationInbox } from '../../../context/NotificationInboxContext'
import { formatUnreadBadgeCount } from '../../../utils/notificationInboxUtils'
import NotificationPanel from './NotificationPanel'
import './notifications.css'

const MOBILE_QUERY = '(max-width: 900px)'

/** Колокольчик уведомлений с badge и панелью */
export default function NotificationBell({ variant = 'desktop' }) {
  const rootRef = useRef(null)
  const isMobileView = useMediaQuery(MOBILE_QUERY)
  const isActiveInstance =
    (variant === 'mobile' && isMobileView) || (variant === 'desktop' && !isMobileView)

  const {
    canUseInbox,
    unreadCount,
    panelOpen,
    togglePanel,
    closePanel,
  } = useNotificationInbox()

  if (!canUseInbox) return null

  const badgeLabel = formatUnreadBadgeCount(unreadCount)

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      togglePanel()
    }
  }

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        className={`notification-bell__button${panelOpen ? ' notification-bell__button--active' : ''}`}
        onClick={togglePanel}
        onKeyDown={handleKeyDown}
        aria-label="Уведомления"
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        title="Уведомления"
      >
        <BellIcon size={20} />
        {badgeLabel && (
          <span className="notification-bell__badge" aria-label={`${unreadCount} непрочитанных`}>
            {badgeLabel}
          </span>
        )}
      </button>

      {isActiveInstance && (
        <NotificationPanel anchorRef={rootRef} open={panelOpen} onClose={closePanel} />
      )}
    </div>
  )
}
