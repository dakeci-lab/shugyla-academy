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

export default function OperationDetailSheet({ operation, supplierName, onClose }) {
  const kind = operation?.kind
  const operationType = kind === 'return' ? 'supply_return' : 'supply'
  const operationId =
    kind === 'return'
      ? Number(operation?.source?.umag_return_id)
      : Number(operation?.source?.umag_supply_id)

  const headerFromHistory = useMemo(() => {
    const source = operation?.source || {}
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
      }
    }
    return {
      title: 'Приёмка',
      supplierName: supplierName || source.supplier_name || '—',
      when: source.doc_time,
      amount: Number(source.amount) || 0,
      signedAmount: Number(source.amount) || 0,
      paymentAmount: Number(source.payment_amount) || 0,
      debt: Number(source.debt) || 0,
      userName: source.umag_user_name,
      comment: source.comment,
      account: source.account,
    }
  }, [operation, kind, supplierName])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [cacheStatus, setCacheStatus] = useState(null)
  const [document, setDocument] = useState(null)
  const [items, setItems] = useState([])
  const [totals, setTotals] = useState(null)
  const [query, setQuery] = useState('')

  async function load({ forceRefresh = false } = {}) {
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
  }, [operationType, operationId])

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
                kind === 'return' ? 'umag-op-detail__amount-neg' : 'umag-op-detail__amount-pos'
              }
            >
              {formatSignedUmagMoney(headerFromHistory.signedAmount)}
            </strong>
          </div>
          {kind === 'supply' ? (
            <>
              <div>
                <span>Оплачено</span>
                <strong>{formatUmagMoney(headerFromHistory.paymentAmount)}</strong>
              </div>
              <div>
                <span>Задолженность</span>
                <strong>{formatUmagMoney(headerFromHistory.debt)}</strong>
              </div>
            </>
          ) : null}
          <div>
            <span>Сотрудник</span>
            <strong>{headerFromHistory.userName || document?.userName || '—'}</strong>
          </div>
          {kind === 'supply' ? (
            <div>
              <span>Счёт</span>
              <strong>{headerFromHistory.account || document?.account || '—'}</strong>
            </div>
          ) : (
            <div>
              <span>Счета</span>
              <strong>
                {formatAccountNames(headerFromHistory.accountNames ?? document?.accountNames)}
              </strong>
            </div>
          )}
        </div>

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
      </div>
    </div>
  )
}
