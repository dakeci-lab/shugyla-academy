import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock'
import { CloseIcon, RefreshIcon } from '../../icons/PlatformIcons'
import { useNotificationInbox } from '../../../context/NotificationInboxContext'
import NotificationList from './NotificationList'
import NotificationEmptyState from './NotificationEmptyState'
import './notifications.css'

const MOBILE_QUERY = '(max-width: 900px)'

function PanelSkeleton() {
  return (
    <div className="notification-panel__skeleton" aria-hidden="true">
      <div className="notification-panel__skeleton-row" />
      <div className="notification-panel__skeleton-row" />
      <div className="notification-panel__skeleton-row" />
    </div>
  )
}

function PanelContent() {
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    error,
    offline,
    hasMore,
    refreshNotifications,
    loadMore,
    handleNotificationClick,
  } = useNotificationInbox()

  if (loading && notifications.length === 0) {
    return <PanelSkeleton />
  }

  if (offline && notifications.length === 0) {
    return (
      <div className="notification-panel__state">
        <p className="notification-panel__state-text">Нет подключения к интернету</p>
        <button
          type="button"
          className="notification-panel__retry-btn"
          onClick={refreshNotifications}
        >
          Повторить
        </button>
      </div>
    )
  }

  if (error && notifications.length === 0) {
    return (
      <div className="notification-panel__state">
        <p className="notification-panel__state-text">
          Не удалось загрузить уведомления
        </p>
        <button
          type="button"
          className="notification-panel__retry-btn"
          onClick={refreshNotifications}
        >
          Повторить
        </button>
      </div>
    )
  }

  if (!loading && notifications.length === 0) {
    return <NotificationEmptyState />
  }

  return (
    <>
      {offline && (
        <div className="notification-panel__state" style={{ padding: '12px 16px' }}>
          <p className="notification-panel__state-text">Нет подключения к интернету</p>
        </div>
      )}
      <NotificationList
        notifications={notifications}
        onItemClick={handleNotificationClick}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </>
  )
}

function PanelHeader({ isMobile, onClose, onRefresh, refreshing, unreadCount }) {
  return (
    <div className="notification-panel__header">
      <div className="notification-panel__title-wrap">
        <h2 className="notification-panel__title">Уведомления</h2>
        {unreadCount > 0 && (
          <p className="notification-panel__subtitle">
            {unreadCount === 1
              ? '1 непрочитанное'
              : `${unreadCount} непрочитанных`}
          </p>
        )}
      </div>

      <div className="notification-panel__actions">
        <button
          type="button"
          className="notification-panel__icon-btn"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Обновить уведомления"
          title="Обновить"
        >
          <RefreshIcon size={18} />
        </button>
        {isMobile && (
          <button
            type="button"
            className="notification-panel__icon-btn"
            onClick={onClose}
            aria-label="Закрыть панель уведомлений"
          >
            <CloseIcon size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Панель списка уведомлений — dropdown на desktop, bottom sheet на mobile */
export default function NotificationPanel({ anchorRef, open, onClose }) {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const panelRef = useRef(null)
  const [animatedOpen, setAnimatedOpen] = useState(false)
  const {
    unreadCount,
    loading,
    refreshNotifications,
  } = useNotificationInbox()

  useBodyScrollLock(open && isMobile)

  useEffect(() => {
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setAnimatedOpen(true))
      })
      return () => window.cancelAnimationFrame(frame)
    }

    setAnimatedOpen(false)
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (isMobile) return
      const anchor = anchorRef?.current
      const panel = panelRef.current
      if (anchor?.contains(event.target) || panel?.contains(event.target)) return
      onClose?.()
    }

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [anchorRef, isMobile, onClose, open])

  if (!open) return null

  const panelBody = (
    <div
      ref={panelRef}
      className={`notification-panel ${isMobile ? 'notification-panel--mobile' : 'notification-panel--desktop'}`}
      role="dialog"
      aria-label="Уведомления"
      style={
        isMobile
          ? {
              transform: animatedOpen ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.28s ease',
            }
          : undefined
      }
    >
      {isMobile && <div className="notification-panel__handle" aria-hidden="true" />}
      <PanelHeader
        isMobile={isMobile}
        onClose={onClose}
        onRefresh={refreshNotifications}
        refreshing={loading}
        unreadCount={unreadCount}
      />
      <div className="notification-panel__body">
        <PanelContent />
      </div>
    </div>
  )

  if (isMobile) {
    return createPortal(
      <>
        <button
          type="button"
          className="notification-panel__overlay"
          onClick={onClose}
          aria-label="Закрыть панель уведомлений"
        />
        {panelBody}
      </>,
      document.body
    )
  }

  return panelBody
}
