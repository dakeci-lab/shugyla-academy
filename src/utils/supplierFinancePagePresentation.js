/**
 * Pure presentation logic for the Этап 2.7 unified «Расчёты» shell —
 * split out from SupplierFinancePanel.jsx (which has JSX and can't be
 * imported by a plain Node verify script) so tab resolution and sync-status
 * derivation are directly, really testable.
 */

import { formatUmagDateTime } from '../services/umagSettlementsService'

const MONTH_NAMES_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

/**
 * Presentation only — the business date itself always comes from the
 * caller's summary.todayKey (Asia/Aqtobe), never a fresh `new Date()`.
 */
export function monthLabelFromDateKey(dateKey) {
  const month = Number(String(dateKey || '').slice(5, 7))
  return MONTH_NAMES_RU[month - 1] || ''
}

/**
 * Permission-aware default/fallback tab (item 14): the requested ?tab= wins
 * only if it's in the allowed list; otherwise the first allowed tab —
 * 'payments' before 'settlements' when both are allowed, since callers push
 * 'payments' first when canViewPayments is true.
 */
export function resolveActiveTab(rawTab, allowedTabs) {
  if (rawTab && allowedTabs.includes(rawTab)) return rawTab
  return allowedTabs[0] || null
}

/** Compact sync-status presentation — success/partial/running/failed never conflated. */
export function describeSyncStatus(lastSync) {
  if (!lastSync) {
    return { text: 'UMAG · ещё не синхронизировано', tone: 'neutral', title: null }
  }
  if (lastSync.status === 'running') {
    return { text: 'UMAG · синхронизация…', tone: 'running', title: null }
  }
  const at = lastSync.finished_at || lastSync.started_at
  const timeLabel = at ? formatUmagDateTime(at) : '—'
  if (lastSync.status === 'failed') {
    return {
      text: 'UMAG · Ошибка',
      tone: 'failed',
      title: lastSync.error_message || 'Последняя синхронизация завершилась ошибкой',
    }
  }
  if (lastSync.status === 'partial') {
    return {
      text: `UMAG · ${timeLabel} · Частично`,
      tone: 'partial',
      title: lastSync.warning_message || 'Синхронизация завершена частично',
    }
  }
  return { text: `UMAG · ${timeLabel}`, tone: 'success', title: null }
}
