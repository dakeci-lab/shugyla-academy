import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeShift } from '../utils/shiftData'
import {
  saveEmployeeShift,
  applyBulkEmployeeShifts,
} from '../services/academyDataService'
import { toastSuccess, toastError, toastWarning } from '../services/notificationService'

export const SYNC_STATUS = {
  SYNCED: 'synced',
  SAVING: 'saving',
  UNSYNCED: 'unsynced',
  ERROR: 'error',
}

export const BULK_OPERATION_STATUS = {
  IDLE: 'idle',
  SAVING: 'saving',
  SUCCESS: 'success',
  ERROR: 'error',
}

const IDLE_BULK_OPERATION = {
  status: BULK_OPERATION_STATUS.IDLE,
  operationId: null,
  payload: null,
  error: null,
}

function payloadToRawShift(employeeId, payload, existingShift) {
  return {
    id: existingShift?.id ?? `local-${payload.shiftDate}-${Date.now()}`,
    employee_id: Number(employeeId),
    shift_date: payload.shiftDate,
    status: payload.status,
    planned_start_time: payload.plannedStartTime,
    planned_end_time: payload.plannedEndTime,
    planned_break_start: payload.plannedBreakStart,
    planned_break_end: payload.plannedBreakEnd,
    actual_start_time: payload.actualStartTime,
    actual_end_time: payload.actualEndTime,
    actual_break_start: payload.actualBreakStart,
    actual_break_end: payload.actualBreakEnd,
    comment: payload.comment,
  }
}

export function buildOptimisticShift(employeeId, payload, existingShift) {
  return normalizeShift(payloadToRawShift(employeeId, payload, existingShift))
}

export function upsertShiftInList(shifts, nextShift) {
  const list = [...(shifts || [])]
  const index = list.findIndex((row) => row.shiftDate === nextShift.shiftDate)
  if (index >= 0) {
    list[index] = nextShift
  } else {
    list.push(nextShift)
  }
  return list.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate))
}

/** Фоновая синхронизация графика с optimistic UI */
export function useScheduleBackgroundSync({ employeeId, userId, onBulkSuccess }) {
  const [syncMetaByDate, setSyncMetaByDate] = useState({})
  const [bulkOperation, setBulkOperation] = useState(IDLE_BULK_OPERATION)
  const mutationVersionsRef = useRef(new Map())
  const inFlightRef = useRef(new Map())
  const bulkInFlightRef = useRef(null)

  const hasUnsyncedChanges = Object.values(syncMetaByDate).some((meta) =>
    [SYNC_STATUS.SAVING, SYNC_STATUS.UNSYNCED, SYNC_STATUS.ERROR].includes(meta.syncStatus)
  )

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!hasUnsyncedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsyncedChanges])

  const setSyncMeta = useCallback((dateKey, patch) => {
    setSyncMetaByDate((prev) => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] || {}),
        ...patch,
        dateKey,
      },
    }))
  }, [])

  const runSingleSave = useCallback(
    async (payload, existingShift, applySavedShift) => {
      const dateKey = payload.shiftDate
      const nextVersion = (mutationVersionsRef.current.get(dateKey) || 0) + 1
      mutationVersionsRef.current.set(dateKey, nextVersion)

      if (inFlightRef.current.get(dateKey)) {
        inFlightRef.current.get(dateKey).abortStale = true
      }

      const flight = { abortStale: false }
      inFlightRef.current.set(dateKey, flight)

      setSyncMeta(dateKey, {
        syncStatus: SYNC_STATUS.SAVING,
        mutationVersion: nextVersion,
        localData: payload,
        previousData: existingShift ?? null,
        errorMessage: null,
      })

      try {
        const saved = await saveEmployeeShift(employeeId, payload, userId)
        if (
          flight.abortStale ||
          mutationVersionsRef.current.get(dateKey) !== nextVersion
        ) {
          return
        }

        applySavedShift(saved)
        setSyncMeta(dateKey, {
          syncStatus: SYNC_STATUS.SYNCED,
          mutationVersion: nextVersion,
          errorMessage: null,
        })
        toastSuccess('График сохранён')
      } catch (error) {
        if (
          flight.abortStale ||
          mutationVersionsRef.current.get(dateKey) !== nextVersion
        ) {
          return
        }

        setSyncMeta(dateKey, {
          syncStatus: SYNC_STATUS.ERROR,
          mutationVersion: nextVersion,
          errorMessage: error.message || 'Не удалось сохранить график',
        })
        toastError('Не удалось сохранить график')
      } finally {
        if (inFlightRef.current.get(dateKey) === flight) {
          inFlightRef.current.delete(dateKey)
        }
      }
    },
    [employeeId, setSyncMeta, userId]
  )

  const enqueueSave = useCallback(
    (payload, existingShift, setShifts) => {
      toastWarning('Сохраняем график…', 2200)

      const optimistic = buildOptimisticShift(employeeId, payload, existingShift)
      setShifts((prev) => upsertShiftInList(prev, optimistic))

      const applySavedShift = (saved) => {
        setShifts((prev) => upsertShiftInList(prev, saved))
      }

      void runSingleSave(payload, existingShift, applySavedShift)
    },
    [employeeId, runSingleSave]
  )

  const retrySave = useCallback(
    (dateKey, setShifts) => {
      const meta = syncMetaByDate[dateKey]
      if (!meta?.localData) return
      const existing = meta.previousData
      enqueueSave(meta.localData, existing, setShifts)
    },
    [enqueueSave, syncMetaByDate]
  )

  const runBulkSave = useCallback(
    async (operationId, snapshot, setShifts) => {
      const { entries, options } = snapshot
      const flight = { operationId }
      bulkInFlightRef.current = flight

      try {
        await applyBulkEmployeeShifts(employeeId, entries, {
          ...options,
          createdBy: userId,
        })

        if (bulkInFlightRef.current?.operationId !== operationId) return

        entries.forEach((entry) => {
          setSyncMeta(entry.shiftDate, {
            syncStatus: SYNC_STATUS.SYNCED,
            errorMessage: null,
          })
        })

        setBulkOperation({
          status: BULK_OPERATION_STATUS.SUCCESS,
          operationId,
          payload: snapshot,
          error: null,
        })
        toastSuccess('График успешно сохранён')
        await onBulkSuccess?.()
      } catch (error) {
        if (bulkInFlightRef.current?.operationId !== operationId) return

        const message = error.message || 'Не удалось сохранить график'
        entries.forEach((entry) => {
          setSyncMeta(entry.shiftDate, {
            syncStatus: SYNC_STATUS.ERROR,
            errorMessage: message,
          })
        })
        setBulkOperation({
          status: BULK_OPERATION_STATUS.ERROR,
          operationId,
          payload: snapshot,
          error: message,
        })
        toastError('Не удалось сохранить график')
      } finally {
        if (bulkInFlightRef.current?.operationId === operationId) {
          bulkInFlightRef.current = null
        }
      }
    },
    [employeeId, onBulkSuccess, setSyncMeta, userId]
  )

  const enqueueBulkSave = useCallback(
    (snapshot, setShifts, closeModal) => {
      const entries = snapshot?.entries || []
      if (!entries.length) return false
      if (bulkOperation.status === BULK_OPERATION_STATUS.SAVING) return false

      const operationId = crypto.randomUUID()
      setBulkOperation({
        status: BULK_OPERATION_STATUS.SAVING,
        operationId,
        payload: snapshot,
        error: null,
      })

      entries.forEach((entry) => {
        const optimistic = buildOptimisticShift(employeeId, entry, null)
        setShifts((prev) => upsertShiftInList(prev, optimistic))
        setSyncMeta(entry.shiftDate, {
          syncStatus: SYNC_STATUS.SAVING,
          localData: entry,
          previousData: null,
          errorMessage: null,
        })
      })

      closeModal?.()
      toastWarning('График сохраняется…', 5000)
      void runBulkSave(operationId, snapshot, setShifts)
      return true
    },
    [bulkOperation.status, employeeId, runBulkSave, setSyncMeta]
  )

  const retryBulkSave = useCallback(
    (setShifts) => {
      const snapshot = bulkOperation.payload
      if (!snapshot?.entries?.length) return false
      if (bulkOperation.status === BULK_OPERATION_STATUS.SAVING) return false
      return enqueueBulkSave(snapshot, setShifts)
    },
    [bulkOperation.payload, bulkOperation.status, enqueueBulkSave]
  )

  const dismissBulkStatus = useCallback(() => {
    setBulkOperation(IDLE_BULK_OPERATION)
  }, [])

  return {
    syncMetaByDate,
    bulkOperation,
    hasUnsyncedChanges,
    enqueueSave,
    enqueueBulkSave,
    retryBulkSave,
    retrySave,
    dismissBulkStatus,
  }
}
