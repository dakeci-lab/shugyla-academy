import {
  APP_TIMEZONE,
  getYesterdayDateKeyInAppTimezone,
  toDateKeyInAppTimezone,
} from './timezone'

export const DATE_GROUP_LABELS = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  earlier: 'Ранее',
}

export function getNotificationDateGroup(isoString) {
  if (!isoString) return 'earlier'

  const dateKey = toDateKeyInAppTimezone(new Date(isoString))
  const todayKey = toDateKeyInAppTimezone()
  const yesterdayKey = getYesterdayDateKeyInAppTimezone()

  if (dateKey === todayKey) return 'today'
  if (dateKey === yesterdayKey) return 'yesterday'
  return 'earlier'
}

/** Подпись группы: Сегодня / Вчера / 18 июля */
export function formatNotificationDateGroupLabel(dateKey) {
  if (!dateKey) return DATE_GROUP_LABELS.earlier

  const todayKey = toDateKeyInAppTimezone()
  const yesterdayKey = getYesterdayDateKeyInAppTimezone()

  if (dateKey === todayKey) return DATE_GROUP_LABELS.today
  if (dateKey === yesterdayKey) return DATE_GROUP_LABELS.yesterday

  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return DATE_GROUP_LABELS.earlier

  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: APP_TIMEZONE,
  })
}

export function formatNotificationTime(isoString) {
  if (!isoString) return ''

  const date = new Date(isoString)
  const group = getNotificationDateGroup(isoString)

  if (group === 'today') {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: APP_TIMEZONE,
    })
  }

  if (group === 'yesterday') {
    return 'Вчера'
  }

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: APP_TIMEZONE,
  })
}

export function groupNotificationsByDate(notifications) {
  const groups = []
  let currentGroup = null

  for (const notification of notifications) {
    const key = notification?.created_at
      ? toDateKeyInAppTimezone(new Date(notification.created_at))
      : 'unknown'

    if (!currentGroup || currentGroup.key !== key) {
      currentGroup = {
        key,
        label: formatNotificationDateGroupLabel(key),
        items: [],
      }
      groups.push(currentGroup)
    }
    currentGroup.items.push(notification)
  }

  return groups
}

export function formatUnreadBadgeCount(count) {
  if (!count || count <= 0) return null
  if (count > 99) return '99+'
  return String(count)
}

export function getModuleLabel(moduleCode) {
  if (!moduleCode) return 'Уведомление'
  const map = {
    time_tracker: 'Тайм-трекер',
    hr: 'HR',
    procurement: 'Закупки',
    academy: 'Академия',
  }
  return map[moduleCode] || moduleCode.replace(/_/g, ' ')
}
