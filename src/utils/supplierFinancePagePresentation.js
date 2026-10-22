/**
 * Pure presentation logic for the «Расчёты» shell — split out from
 * SupplierFinancePanel.jsx (which has JSX and can't be imported by a plain
 * Node verify script) so sync-status derivation is directly testable.
 */

import { formatUmagDateTime } from '../services/umagSettlementsService'

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
