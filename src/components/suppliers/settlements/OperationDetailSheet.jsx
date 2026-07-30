import { useEffect, useMemo, useState } from 'react'
import {
  buildItemTotals,
  fetchOperationDetails,
  filterOperationItems,
  formatSignedUmagMoney,
  formatUmagDateTime,
  formatUmagMoney,
  OPERATION_DETAIL_ERROR_CODES,
} from '../../../services/umagOperationDetailsService'
import {
  deriveSupplyPaymentStatus,
  supplyPaymentStatusLabel,
} from '../../../services/umagSettlementsService'
import './OperationDetailSheet.css'

function formatQtyPrice(item) {
  const qty = Number(item.quantity) || 0
  const unit = item.unit ? ` ${item.unit}` : ''
  const price =
    item.purchasePrice == null ? '—' : formatUmagMoney(item.purchasePrice).replace(' ₸', '')
  return `${qty}${unit} × ${price} ₸`
}

function formatAccountNames(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ') || '—'
  if (value == null || value === '') return '—'
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean).join(', ') || '—'
    } catch {
      /* plain string */
    }
    return value
  }
  return String(value)
}

function mapErrorMessage(error) {
  const code = error?.code
  if (
    code === OPERATION_DETAIL_ERROR_CODES.NOT_FOUND ||
    code === OPERATION_DETAIL_ERROR_CODES.SOURCE_DELETED ||
    code === 'DOCUMENT_NOT_FOUND' ||
    code === 'DOCUMENT_SOURCE_DELETED'
  ) {
    return 'Документ больше не найден в UMAG'
  }
  return error?.message || 'Не удалось загрузить состав документа'
}

function PaymentStatusBadge({ status }) {
  if (!status) return null
  return (
    <span className={`umag-op-detail__pay-status umag-op-detail__pay-status--${status}`}>
      {supplyPaymentStatusLabel(status)}
    </span>
  )
}

export default function OperationDetailSheet({ operation, supplierName, onClose }) {
  const kind = operation?.kind
  const isPaymentDoc = kind === 'payment' || kind === 'refund'
  const operationType = kind === 'return' ? 'supply_return' : 'supply'
  const operationId = isPaymentDoc
    ? null
    : kind === 'return'
      ? Number(operation?.source?.umag_return_id)
      : Number(operation?.source?.umag_supply_id)

  const headerFromHistory = useMemo(() => {
    const source = operation?.source || {}
    if (kind === 'payment' || kind === 'refund') {
      const abs = Math.abs(Number(source.amount) || Number(operation?.amount) || 0)
      return {
        title: kind === 'refund' ? 'Возврат денежных средств' : 'Оплата поставщику',
        supplierName: supplierName || source.supplier_name || '—',
        when: source.payment_time || operation?.occurredAt,
        amount: abs,
        signedAmount: kind === 'refund' ? abs : -abs,
        userName: source.user_name,
        note: source.note,
        account: source.account_name,
        documentNumber: String(source.umag_payment_id || operation?.documentNumber || ''),
        linkedSupplyId: source.linked_umag_supply_id || null,
        linkedReturnId: source.linked_umag_return_id || null,
        paymentStatus: null,
      }
    }
    if (kind === 'return') {
      return {
        title: 'Возврат поставщику',
        supplierName: supplierName || source.supplier_name || '—',
        when: source.document_time,
        amount: Math.abs(Number(source.amount) || 0),
        signedAmount: -Math.abs(Number(source.amount) || 0),
        userName: source.user_name,
        note: source.note,
        accountNames: source.account_names,
        isProvided: source.is_provided,
        paymentStatus: null,
      }
    }
    const paymentAmount =
      operation?.paymentAmount != null
        ? Number(operation.paymentAmount)
        : Number(source.payment_amount) || 0
    const debt =
      operation?.debt != null ? Number(operation.debt) : Number(source.debt) || 0
    return {
      title: 'Приёмка',
      supplierName: supplierName || source.supplier_name || '—',
      when: source.doc_time,
      amount: Number(source.amount) || 0,
      signedAmount: Number(source.amount) || 0,
      paymentAmount,
      debt,
      paymentStatus:
        operation?.paymentStatus || deriveSupplyPaymentStatus(paymentAmount, debt),
      userName: source.umag_user_name,
      comment: source.comment,
      account: source.account,
    }
  }, [operation, kind, supplierName])

  const [loading, setLoading] = useState(!isPaymentDoc)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [cacheStatus, setCacheStatus] = useState(null)
  const [document, setDocument] = useState(null)
  const [items, setItems] = useState([])
  const [totals, setTotals] = useState(null)
  const [query, setQuery] = useState('')

  async function load({ forceRefresh = false } = {}) {
    if (isPaymentDoc) {
      setLoading(false)
      return
    }
    if (!operationId) {
      setError('Некорректный идентификатор операции')
      setLoading(false)
      return
    }
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await fetchOperationDetails({
        operationType,
        operationId,
        forceRefresh,
      })
      setDocument(result.document)
      setItems(result.items || [])
      setTotals(result.totals || buildItemTotals(result.items || [], headerFromHistory.amount))
      setCacheStatus(result.cache)
    } catch (err) {
      setError(mapErrorMessage(err))
      if (!forceRefresh) {
        setItems([])
        setTotals(null)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load({ forceRefresh: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationType, operationId, isPaymentDoc])

  const visibleItems = useMemo(() => filterOperationItems(items, query), [items, query])
  const displayTotals = totals || buildItemTotals(items, headerFromHistory.amount)

  return (
    <div className="umag-op-detail__backdrop" role="presentation" onClick={onClose}>
      <div
        className="umag-op-detail"
        role="dialog"
        aria-modal="true"
        aria-label={headerFromHistory.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="umag-op-detail__head">
          <div>
            <div className={`umag-op-detail__badge umag-op-detail__badge--${kind}`}>
              {headerFromHistory.title}
            </div>
            <h3 className="umag-op-detail__title">{headerFromHistory.supplierName}</h3>
            <p className="umag-op-detail__muted">
              {headerFromHistory.when
                ? formatUmagDateTime(headerFromHistory.when)
                : 'Дата неизвестна'}
            </p>
          </div>
          <button type="button" className="umag-op-detail__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="umag-op-detail__summary">
          <div>
            <span>Сумма</span>
            <strong
              className={
                kind === 'return' || kind === 'payment'
                  ? 'umag-op-detail__amount-neg'
                  : headerFromHistory.paymentStatus === 'unpaid'
                    ? 'umag-op-detail__money--unpaid'
                    : 'umag-op-detail__amount-pos'
              }
            >
              {formatSignedUmagMoney(headerFromHistory.signedAmount)}
            </strong>
          </div>
          {isPaymentDoc ? (
            <>
              <div>
                <span>Документ UMAG</span>
                <strong>{headerFromHistory.documentNumber || '—'}</strong>
              </div>
              <div>
                <span>Связанная приёмка</span>
                <strong>{headerFromHistory.linkedSupplyId || '—'}</strong>
              </div>
              <div>
                <span>Связанный возврат</span>
                <strong>{headerFromHistory.linkedReturnId || '—'}</strong>
              </div>
              <div>
                <span>Счёт</span>
                <strong>{headerFromHistory.account || '—'}</strong>
              </div>
              <div>
                <span>Сотрудник</span>
                <strong>{headerFromHistory.userName || '—'}</strong>
              </div>
              {headerFromHistory.note ? (
                <div>
                  <span>Комментарий</span>
                  <strong>{headerFromHistory.note}</strong>
                </div>
              ) : null}
            </>
          ) : null}
          {kind === 'supply' ? (
            <>
              <div>
                <span>Оплачено</span>
                <strong
                  className={
                    headerFromHistory.paymentStatus === 'paid'
                      ? 'umag-op-detail__money--paid'
                      : undefined
                  }
                >
                  {formatUmagMoney(headerFromHistory.paymentAmount)}
                </strong>
              </div>
              <div>
                <span>Осталось</span>
                <strong
                  className={
                    headerFromHistory.paymentStatus === 'paid'
                      ? 'umag-op-detail__money--paid'
                      : headerFromHistory.paymentStatus === 'partial'
                        ? 'umag-op-detail__money--partial'
                        : 'umag-op-detail__money--unpaid'
                  }
                >
                  {formatUmagMoney(headerFromHistory.debt)}
                </strong>
              </div>
              <div>
                <span>Статус оплаты</span>
                <PaymentStatusBadge status={headerFromHistory.paymentStatus} />
              </div>
            </>
          ) : null}
          {!isPaymentDoc ? (
            <div>
              <span>Сотрудник</span>
              <strong>{headerFromHistory.userName || document?.userName || '—'}</strong>
            </div>
          ) : null}
          {!isPaymentDoc && kind === 'supply' ? (
            <div>
              <span>Счёт</span>
              <strong>{headerFromHistory.account || document?.account || '—'}</strong>
            </div>
          ) : null}
          {!isPaymentDoc && kind === 'return' ? (
            <div>
              <span>Счета</span>
              <strong>
                {formatAccountNames(headerFromHistory.accountNames ?? document?.accountNames)}
              </strong>
            </div>
          ) : null}
        </div>

        {isPaymentDoc ? (
          <div className="umag-op-detail__empty">
            Платёжный документ UMAG. Состав товарных позиций для этого типа операции не
            загружается.
          </div>
        ) : (
          <>
        {(headerFromHistory.comment || headerFromHistory.note || document?.comment || document?.note) ? (
          <p className="umag-op-detail__comment">
            {headerFromHistory.comment ||
              headerFromHistory.note ||
              document?.comment ||
              document?.note}
          </p>
        ) : null}

        <div className="umag-op-detail__items-head">
          <h4>Товары</h4>
          <button
            type="button"
            className="btn btn-secondary umag-op-detail__refresh"
            onClick={() => void load({ forceRefresh: true })}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Обновление…' : 'Обновить детали'}
          </button>
        </div>

        {cacheStatus === 'hit' ? (
          <div className="umag-op-detail__cache-hint">Из кэша</div>
        ) : null}

        <label className="umag-op-detail__search">
          <span className="visually-hidden">Поиск по товарам или штрихкоду</span>
          <input
            type="search"
            placeholder="Поиск по товарам или штрихкоду"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {loading ? (
          <div className="umag-op-detail__skeleton" aria-busy="true">
            <div />
            <div />
            <div />
          </div>
        ) : error ? (
          <div className="umag-op-detail__error" role="alert">
            {error}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="umag-op-detail__empty">
            {items.length === 0
              ? 'В документе нет товарных позиций'
              : 'Ничего не найдено по запросу'}
          </div>
        ) : (
          <ul className="umag-op-detail__list">
            {visibleItems.map((item, index) => (
              <li key={item.id || `${item.umagLineId || 'i'}-${index}`} className="umag-op-detail__item">
                <div className="umag-op-detail__item-name">
                  {item.productName}
                  {item.isBonus ? <span className="umag-op-detail__bonus">бонус</span> : null}
                </div>
                {item.barcode ? (
                  <div className="umag-op-detail__item-barcode">{item.barcode}</div>
                ) : null}
                <div className="umag-op-detail__item-row">
                  <span>{formatQtyPrice(item)}</span>
                  <strong>
                    {item.lineAmount == null ? '—' : formatUmagMoney(item.lineAmount)}
                  </strong>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error ? (
          <div className="umag-op-detail__footer">
            <div>
              <span>Позиций</span>
              <strong>{displayTotals.lineCount}</strong>
            </div>
            <div>
              <span>Кол-во по строкам</span>
              <strong>{displayTotals.quantitySum}</strong>
            </div>
            <div>
              <span>Сумма строк</span>
              <strong>{formatUmagMoney(displayTotals.lineAmountSum)}</strong>
            </div>
            {displayTotals.differenceNotable ? (
              <div className="umag-op-detail__diff" role="status">
                Сумма строк отличается от суммы документа на{' '}
                {formatUmagMoney(Math.abs(displayTotals.difference))}
              </div>
            ) : null}
          </div>
        ) : null}
          </>
        )}
      </div>
    </div>
  )
}
