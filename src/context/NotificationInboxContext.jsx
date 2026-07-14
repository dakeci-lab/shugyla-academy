import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { AUTH_STATUS, useSession } from './SessionContext'
import { useToast } from './ToastContext'
import {
  loadNotifications,
  loadUnreadNotificationCount,
  markNotificationRead,
  PAGE_SIZE,
  validateNotificationActionUrl,
  isNotificationUnread,
} from '../services/inAppNotificationService'

const STALE_MS = 60_000

const NotificationInboxContext = createContext(null)

export function NotificationInboxProvider({ children }) {
  const navigate = useNavigate()
  const { authStatus, supabaseAuthenticated } = useSession()
  const { warning: showWarningToast } = useToast()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [offline, setOffline] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const offsetRef = useRef(0)
  const listLoadedRef = useRef(false)
  const lastFetchRef = useRef(0)
  const countRequestRef = useRef(0)
  const listRequestRef = useRef(0)
  const mountedRef = useRef(true)

  const canUseInbox =
    authStatus === AUTH_STATUS.AUTHENTICATED && supabaseAuthenticated

  const resetNotificationState = useCallback(() => {
    setNotifications([])
    setUnreadCount(0)
    setLoading(false)
    setLoadingMore(false)
    setError(null)
    setOffline(false)
    setHasMore(false)
    setPanelOpen(false)
    setInitialized(false)
    offsetRef.current = 0
    listLoadedRef.current = false
    lastFetchRef.current = 0
  }, [])

  const refreshUnreadCount = useCallback(async () => {
    if (!canUseInbox) return

    const requestId = ++countRequestRef.current
    const count = await loadUnreadNotificationCount()

    if (!mountedRef.current || requestId !== countRequestRef.current) return

    setUnreadCount(count)
    setInitialized(true)
    lastFetchRef.current = Date.now()
  }, [canUseInbox])

  const applyListResult = useCallback((result, { append = false } = {}) => {
    if (result.offline) {
      setOffline(true)
    } else {
      setOffline(false)
    }

    if (result.error) {
      setError(result.error)
      return false
    }

    setError(null)
    setHasMore(result.hasMore)

    if (append) {
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        const nextItems = result.items.filter((item) => !existingIds.has(item.id))
        return [...prev, ...nextItems]
      })
    } else {
      setNotifications(result.items)
    }

    offsetRef.current = append
      ? offsetRef.current + result.items.length
      : result.items.length

    listLoadedRef.current = true
    lastFetchRef.current = Date.now()
    return true
  }, [])

  const refreshNotifications = useCallback(async () => {
    if (!canUseInbox) return

    const requestId = ++listRequestRef.current
    setLoading(true)
    setError(null)

    const result = await loadNotifications({ limit: PAGE_SIZE, offset: 0 })

    if (!mountedRef.current || requestId !== listRequestRef.current) return

    offsetRef.current = 0
    applyListResult(result, { append: false })
    setLoading(false)

    await refreshUnreadCount()
  }, [applyListResult, canUseInbox, refreshUnreadCount])

  const loadMore = useCallback(async () => {
    if (!canUseInbox || loadingMore || !hasMore) return

    const requestId = ++listRequestRef.current
    setLoadingMore(true)

    const result = await loadNotifications({
      limit: PAGE_SIZE,
      offset: offsetRef.current,
    })

    if (!mountedRef.current || requestId !== listRequestRef.current) return

    applyListResult(result, { append: true })
    setLoadingMore(false)
  }, [applyListResult, canUseInbox, hasMore, loadingMore])

  const openPanel = useCallback(() => {
    setPanelOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const togglePanel = useCallback(() => {
    setPanelOpen((value) => !value)
  }, [])

  const markAsRead = useCallback(
    async (notificationId) => {
      const target = notifications.find((item) => item.id === notificationId)
      if (!target || !isNotificationUnread(target)) {
        return { ok: true }
      }

      const previousReadAt = target.read_at
      const readAt = new Date().toISOString()

      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId ? { ...item, read_at: readAt } : item
        )
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))

      const result = await markNotificationRead(notificationId)

      if (!result.ok) {
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notificationId ? { ...item, read_at: previousReadAt } : item
          )
        )
        setUnreadCount((prev) => prev + 1)
        showWarningToast('Не удалось отметить уведомление прочитанным')
        return { ok: false }
      }

      return { ok: true }
    },
    [notifications, showWarningToast]
  )

  const handleNotificationClick = useCallback(
    async (notification) => {
      if (!notification) return

      if (isNotificationUnread(notification)) {
        void markAsRead(notification.id)
      }

      const actionUrl = validateNotificationActionUrl(notification.action_url)
      if (actionUrl) {
        closePanel()
        navigate(actionUrl)
      }
    },
    [closePanel, markAsRead, navigate]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (authStatus === AUTH_STATUS.LOADING) return

    if (!canUseInbox) {
      resetNotificationState()
      return
    }

    void refreshUnreadCount()
  }, [authStatus, canUseInbox, refreshUnreadCount, resetNotificationState])

  useEffect(() => {
    if (!panelOpen || !canUseInbox) return

    if (!listLoadedRef.current) {
      void refreshNotifications()
      return
    }

    if (Date.now() - lastFetchRef.current > STALE_MS) {
      void refreshNotifications()
    }
  }, [canUseInbox, panelOpen, refreshNotifications])

  useEffect(() => {
    if (!canUseInbox) return undefined

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchRef.current <= STALE_MS) return

      void refreshUnreadCount()
      if (panelOpen && listLoadedRef.current) {
        void refreshNotifications()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [canUseInbox, panelOpen, refreshNotifications, refreshUnreadCount])

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      loadingMore,
      error,
      offline,
      hasMore,
      panelOpen,
      initialized,
      canUseInbox,
      openPanel,
      closePanel,
      togglePanel,
      refreshNotifications,
      loadMore,
      markAsRead,
      handleNotificationClick,
      resetNotificationState,
    }),
    [
      notifications,
      unreadCount,
      loading,
      loadingMore,
      error,
      offline,
      hasMore,
      panelOpen,
      initialized,
      canUseInbox,
      openPanel,
      closePanel,
      togglePanel,
      refreshNotifications,
      loadMore,
      markAsRead,
      handleNotificationClick,
      resetNotificationState,
    ]
  )

  return (
    <NotificationInboxContext.Provider value={value}>
      {children}
    </NotificationInboxContext.Provider>
  )
}

export function useNotificationInbox() {
  const context = useContext(NotificationInboxContext)
  if (!context) {
    throw new Error('useNotificationInbox must be used within NotificationInboxProvider')
  }
  return context
}

export function useOptionalNotificationInbox() {
  return useContext(NotificationInboxContext)
}
