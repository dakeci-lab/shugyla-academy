import { useCallback, useEffect, useState } from 'react'
import AdminModal from '../../admin/AdminModal'
import {
  RECONCILIATION_STATUS,
  attachReconciliationDocument,
  createReconciliationDocumentSignedUrl,
  describeDifference,
  formatReconciliationPeriod,
  getSupplierReconciliation,
  listReconciliationDocuments,
  reconciliationStatusLabel,
  resolveReconciliation,
  updateDraftReconciliation,
  validateReconciliationFile,
} from '../../../services/supplierReconciliationService'
import { formatUmagDateTime, formatUmagMoney } from '../../../services/umagSettlementsService'
import './ReconciliationDetailView.css'

function Metric({ label, value, emphasize }) {
  return (
    <div className={`recon-detail__metric${emphasize ? ' recon-detail__metric--debt' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function ReconciliationDetailView({
  reconciliationId,
  canEdit,
  canResolve,
  userId,
  onBack,
  showError,
  showSuccess,
}) {
  const [item, setItem] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportedRaw, setReportedRaw] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolving, setResolving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [recon, documents] = await Promise.all([
        getSupplierReconciliation(reconciliationId),
        listReconciliationDocuments(reconciliationId),
      ])
      if (!recon) {
        setError('Сверка не найдена')
        setItem(null)
        setDocs([])
      } else {
        setItem(recon)
        setDocs(documents)
        setReportedRaw(
          recon.supplierReportedBalance == null ? '' : String(recon.supplierReportedBalance)
        )
        setComment(recon.comment || '')
      }
    } catch (err) {
      setError(err.message || 'Не удалось загрузить сверку')
      setItem(null)
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [reconciliationId])

  useEffect(() => {
    void load()
  }, [load])

  async function openDocument(doc) {
    try {
      const url = await createReconciliationDocumentSignedUrl(doc.storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      showError?.(err.message || 'Не удалось открыть документ')
    }
  }

  async function handleSaveDraft() {
    if (!item || !canEdit || saving) return
    const cleaned = reportedRaw.trim().replace(/\s/g, '').replace(',', '.')
    const balance = cleaned === '' ? null : Number(cleaned)
    if (cleaned !== '' && !Number.isFinite(balance)) {
      showError?.('Укажите корректную сумму по акту поставщика')
      return
    }
    setSaving(true)
    try {
      const updated = await updateDraftReconciliation(item.id, {
        supplierReportedBalance: balance,
        comment,
        updatedBy: userId,
      })
      setItem(updated)
      showSuccess?.('Черновик обновлён')
    } catch (err) {
      showError?.(err.message || 'Не удалось обновить черновик')
    } finally {
      setSaving(false)
    }
  }

  async function handleAttach(file) {
    if (!file || !item || !canEdit) return
    const fileError = validateReconciliationFile(file)
    if (fileError) {
      showError?.(fileError)
      return
    }
    try {
      const doc = await attachReconciliationDocument(item.id, file, userId)
      setDocs((prev) => [doc, ...prev])
      showSuccess?.('Документ прикреплён')
    } catch (err) {
      showError?.(err.message || 'Не удалось загрузить документ')
    }
  }

  async function handleResolve() {
    if (!item || !canResolve || resolving) return
    setResolving(true)
    try {
      const updated = await resolveReconciliation(item.id, {
        resolutionNote,
        closedBy: userId,
      })
      setItem(updated)
      setResolveOpen(false)
      setResolutionNote('')
      showSuccess?.('Расхождение отмечено как устранено')
    } catch (err) {
      showError?.(err.message || 'Не удалось закрыть расхождение')
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return (
      <div className="recon-detail">
        <button type="button" className="umag-settlements__back" onClick={onBack}>
          ← Назад к поставщику
        </button>
        <div className="recon-detail__loading">Загрузка сверки…</div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="recon-detail">
        <button type="button" className="umag-settlements__back" onClick={onBack}>
          ← Назад к поставщику
        </button>
        <div className="recon-detail__error" role="alert">
          {error || 'Сверка не найдена'}
        </div>
      </div>
    )
  }

  const diffView = describeDifference(item.difference)
  const isDraft = item.status === RECONCILIATION_STATUS.DRAFT
  const canMarkResolved =
    canResolve &&
    (item.status === RECONCILIATION_STATUS.DISCREPANCY ||
      item.status === RECONCILIATION_STATUS.MATCHED)

  return (
    <div className="recon-detail">
      <button type="button" className="umag-settlements__back" onClick={onBack}>
        ← Назад к поставщику
      </button>

      <div className="recon-detail__header">
        <h2 className="recon-detail__title">Акт сверки · {item.supplierName}</h2>
        <span className={`recon-detail__badge recon-detail__badge--${item.status}`}>
          {reconciliationStatusLabel(item.status)}
        </span>
      </div>

      <div className="recon-detail__meta">
        <span>Период: {formatReconciliationPeriod(item.dateFrom, item.dateTo)}</span>
        <span>Создано: {formatUmagDateTime(item.createdAt)}</span>
        <span>Кто создал: {item.createdByName || '—'}</span>
        {item.closedAt ? (
          <span>
            Закрыто: {formatUmagDateTime(item.closedAt)}
            {item.closedByName ? ` · ${item.closedByName}` : ''}
          </span>
        ) : null}
      </div>

      <section className="recon-detail__section">
        <h3>По данным UMAG за выбранный период</h3>
        <p className="recon-detail__hint">
          Snapshot на момент создания сверки. Последующие синхронизации UMAG эти значения не меняют.
          Для сравнения с актом используется задолженность (SUM debt).
        </p>
        <div className="recon-detail__metrics">
          <Metric label="Приёмки" value={item.umagSupplyCount} />
          <Metric label="Сумма приёмок" value={formatUmagMoney(item.umagSupplyAmount)} />
          <Metric label="Оплачено" value={formatUmagMoney(item.umagPaymentAmount)} />
          <Metric label="Возвраты" value={formatUmagMoney(item.umagPaymentRefundAmount)} />
          <Metric label="Задолженность" value={formatUmagMoney(item.umagDebt)} emphasize />
        </div>
      </section>

      <section className="recon-detail__section">
        <h3>По акту поставщика</h3>
        {isDraft && canEdit ? (
          <label className="recon-detail__field">
            <span>Задолженность по акту</span>
            <input
              type="text"
              inputMode="decimal"
              value={reportedRaw}
              onChange={(e) => setReportedRaw(e.target.value)}
            />
          </label>
        ) : (
          <div className="recon-detail__value">
            {item.supplierReportedBalance == null
              ? '—'
              : formatUmagMoney(item.supplierReportedBalance)}
          </div>
        )}
      </section>

      <section className="recon-detail__section recon-detail__section--diff">
        <h3>Расхождение</h3>
        <div className="recon-detail__diff-value">{diffView.amountLabel}</div>
        <div className="recon-detail__diff-hint">{diffView.hint}</div>
      </section>

      <section className="recon-detail__section">
        <h3>Комментарий</h3>
        {isDraft && canEdit ? (
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        ) : (
          <p className="recon-detail__text">{item.comment || '—'}</p>
        )}
        {item.resolutionNote ? (
          <>
            <h4 className="recon-detail__subtitle">Как устранено</h4>
            <p className="recon-detail__text">{item.resolutionNote}</p>
          </>
        ) : null}
      </section>

      <section className="recon-detail__section">
        <h3>Документы</h3>
        {docs.length === 0 ? (
          <p className="recon-detail__text">Документы не прикреплены</p>
        ) : (
          <ul className="recon-detail__docs">
            {docs.map((doc) => (
              <li key={doc.id}>
                <button type="button" className="recon-detail__doc-link" onClick={() => openDocument(doc)}>
                  {doc.fileName}
                </button>
              </li>
            ))}
          </ul>
        )}
        {(isDraft || item.status === RECONCILIATION_STATUS.DISCREPANCY) && canEdit ? (
          <label className="recon-detail__file">
            <span>Прикрепить акт</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void handleAttach(f)
              }}
            />
          </label>
        ) : null}
      </section>

      <div className="recon-detail__actions">
        {isDraft && canEdit ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveDraft}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Сохранить изменения'}
          </button>
        ) : null}
        {canMarkResolved ? (
          <button type="button" className="btn btn-secondary" onClick={() => setResolveOpen(true)}>
            Отметить как устранено
          </button>
        ) : null}
      </div>

      {resolveOpen ? (
        <AdminModal
          title="Как устранено расхождение?"
          onClose={() => setResolveOpen(false)}
          footer={
            <div className="recon-detail__resolve-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResolveOpen(false)}
                disabled={resolving}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResolve}
                disabled={resolving}
              >
                {resolving ? 'Сохранение…' : 'Подтвердить'}
              </button>
            </div>
          }
        >
          <label className="recon-detail__field">
            <span>Комментарий (обязательно)</span>
            <textarea
              rows={4}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Опишите, как устранено расхождение"
            />
          </label>
        </AdminModal>
      ) : null}
    </div>
  )
}
