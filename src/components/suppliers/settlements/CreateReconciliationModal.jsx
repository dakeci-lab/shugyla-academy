import { useEffect, useMemo, useState } from 'react'
import AdminModal from '../../admin/AdminModal'
import {
  computeReconciliationDifference,
  computeUmagSnapshotForSupplier,
  createSupplierReconciliation,
  deriveReconciliationStatus,
  describeDifference,
  reconciliationStatusLabel,
  validateReconciliationFile,
} from '../../../services/supplierReconciliationService'
import {
  formatUmagDateTime,
  formatUmagMoney,
  syncUmagSettlements,
} from '../../../services/umagSettlementsService'
import './CreateReconciliationModal.css'

function parseMoneyInput(raw) {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

export default function CreateReconciliationModal({
  supplier,
  defaultDateFrom,
  defaultDateTo,
  lastRun,
  canSync,
  createdBy,
  onClose,
  onCreated,
  onSyncComplete,
  showError,
  showSuccess,
  showWarning,
}) {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [reportedRaw, setReportedRaw] = useState('')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [snapshotLoading, setSnapshotLoading] = useState(true)
  const [snapshotError, setSnapshotError] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSnapshot() {
      setSnapshotLoading(true)
      setSnapshotError('')
      try {
        const next = await computeUmagSnapshotForSupplier({
          platformSupplierId: supplier.platformSupplierId || supplier.supplierId,
          umagSupplierId: supplier.umagSupplierId,
          dateFrom,
          dateTo,
        })
        if (!cancelled) setSnapshot(next)
      } catch (err) {
        if (!cancelled) {
          setSnapshot(null)
          setSnapshotError(err.message || 'Не удалось рассчитать показатели UMAG')
        }
      } finally {
        if (!cancelled) setSnapshotLoading(false)
      }
    }
    void loadSnapshot()
    return () => {
      cancelled = true
    }
  }, [
    supplier.platformSupplierId,
    supplier.supplierId,
    supplier.umagSupplierId,
    dateFrom,
    dateTo,
  ])

  const reportedBalance = useMemo(() => parseMoneyInput(reportedRaw), [reportedRaw])
  const difference = useMemo(() => {
    if (!snapshot || reportedBalance == null || Number.isNaN(reportedBalance)) return null
    return computeReconciliationDifference(reportedBalance, snapshot.umagDebt)
  }, [snapshot, reportedBalance])
  const previewStatus = useMemo(
    () =>
      deriveReconciliationStatus(
        reportedBalance == null || Number.isNaN(reportedBalance) ? null : reportedBalance,
        difference
      ),
    [reportedBalance, difference]
  )
  const diffView = describeDifference(difference)

  async function handleSync() {
    if (!canSync || syncing) return
    setSyncing(true)
    const result = await syncUmagSettlements({ dateFrom, dateTo, syncSuppliers: true })
    setSyncing(false)
    if (!result.success) {
      showError?.(result.message)
      return
    }
    if (result.status === 'partial' || result.warning) {
      showWarning?.(result.warning || result.message)
    } else {
      showSuccess?.(result.message)
    }
    onSyncComplete?.()
    try {
      const next = await computeUmagSnapshotForSupplier({
        platformSupplierId: supplier.platformSupplierId || supplier.supplierId,
        umagSupplierId: supplier.umagSupplierId,
        dateFrom,
        dateTo,
      })
      setSnapshot(next)
      setSnapshotError('')
    } catch (err) {
      setSnapshotError(err.message || 'Не удалось обновить показатели UMAG')
    }
  }

  async function handleSave() {
    if (saving) return
    if (dateFrom > dateTo) {
      showError?.('Дата начала не может быть позже даты окончания')
      return
    }
    if (reportedRaw.trim() && Number.isNaN(reportedBalance)) {
      showError?.('Укажите корректную сумму по акту поставщика')
      return
    }
    if (file) {
      const fileError = validateReconciliationFile(file)
      if (fileError) {
        showError?.(fileError)
        return
      }
    }

    setSaving(true)
    try {
      const created = await createSupplierReconciliation({
        platformSupplierId: supplier.platformSupplierId || supplier.supplierId,
        umagSupplierId: supplier.umagSupplierId,
        supplierName: supplier.name,
        dateFrom,
        dateTo,
        supplierReportedBalance:
          reportedBalance == null || Number.isNaN(reportedBalance) ? null : reportedBalance,
        comment,
        file,
        createdBy,
      })
      showSuccess?.('Сверка сохранена')
      onCreated?.(created)
    } catch (err) {
      showError?.(err.message || 'Не удалось сохранить сверку')
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div className="recon-create__footer">
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
        Отмена
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving || snapshotLoading || Boolean(snapshotError)}
      >
        {saving ? 'Сохранение…' : 'Сохранить сверку'}
      </button>
    </div>
  )

  return (
    <AdminModal title="Создать акт сверки" onClose={onClose} footer={footer} wide autoFocusClose={false}>
      <div className="recon-create">
        <label className="recon-create__field">
          <span>Поставщик</span>
          <input type="text" value={supplier.name} readOnly />
        </label>

        <div className="recon-create__period">
          <label className="recon-create__field">
            <span>Период с</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="recon-create__field">
            <span>по</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        <div className="recon-create__sync-meta">
          <span>
            Последняя синхронизация UMAG:{' '}
            {lastRun?.finished_at || lastRun?.started_at
              ? formatUmagDateTime(lastRun.finished_at || lastRun.started_at)
              : 'ещё не выполнялась'}
          </span>
          {canSync ? (
            <button
              type="button"
              className="btn btn-secondary recon-create__sync-btn"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Синхронизация…' : 'Синхронизировать'}
            </button>
          ) : null}
        </div>

        <section className="recon-create__block" aria-label="По данным UMAG">
          <h3 className="recon-create__block-title">По данным UMAG за выбранный период</h3>
          <p className="recon-create__hint">
            Сумма задолженности — SUM(debt) активных приёмок за период. Это не полный бухгалтерский
            баланс поставщика.
          </p>
          {snapshotLoading ? (
            <div className="recon-create__loading">Расчёт показателей…</div>
          ) : snapshotError ? (
            <div className="recon-create__error" role="alert">
              {snapshotError}
            </div>
          ) : (
            <div className="recon-create__metrics">
              <div>
                <span>Приёмки</span>
                <strong>{snapshot.umagSupplyCount}</strong>
              </div>
              <div>
                <span>Сумма приёмок</span>
                <strong>{formatUmagMoney(snapshot.umagSupplyAmount)}</strong>
              </div>
              <div>
                <span>Оплачено</span>
                <strong>{formatUmagMoney(snapshot.umagPaymentAmount)}</strong>
              </div>
              <div>
                <span>Возвраты</span>
                <strong>{formatUmagMoney(snapshot.umagPaymentRefundAmount)}</strong>
              </div>
              <div className="recon-create__metrics--debt">
                <span>Задолженность (для сравнения)</span>
                <strong>{formatUmagMoney(snapshot.umagDebt)}</strong>
              </div>
            </div>
          )}
        </section>

        <label className="recon-create__field">
          <span>Задолженность по акту поставщика</span>
          <div className="recon-create__money">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={reportedRaw}
              onChange={(e) => setReportedRaw(e.target.value)}
            />
            <span>₸</span>
          </div>
        </label>

        <div className="recon-create__diff" aria-live="polite">
          <div className="recon-create__diff-label">Расхождение</div>
          <div className="recon-create__diff-value">{diffView.amountLabel}</div>
          <div className="recon-create__diff-hint">{diffView.hint}</div>
          <div className="recon-create__status">
            Статус: {reconciliationStatusLabel(previewStatus)}
          </div>
        </div>

        <label className="recon-create__field">
          <span>Комментарий</span>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необязательно"
          />
        </label>

        <label className="recon-create__field">
          <span>Документ</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <span className="recon-create__file-hint">PDF, JPG или PNG, до 15 МБ</span>
          {file ? <span className="recon-create__file-name">{file.name}</span> : null}
        </label>
      </div>
    </AdminModal>
  )
}
