/** Статус синхронизации записи с сервером */

import { toUserErrorMessage } from './userErrorMessage'

export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  ERROR: 'error',
}

export const SYNC_STATUS_LABELS = {
  pending: '⏳ Сохранение…',
  error: '⚠ Не синхронизировано',
}

export function isSyncPending(status) {
  return status === SYNC_STATUS.PENDING
}

export function isSyncError(status) {
  return status === SYNC_STATUS.ERROR
}

export function formatSyncErrorMessage(error) {
  return toUserErrorMessage(error, 'Не удалось сохранить данные')
}
