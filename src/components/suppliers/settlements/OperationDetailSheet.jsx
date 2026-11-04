import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  deriveSupplyPaymentStatus,
  formatSignedUmagMoney,
  formatUmagDateTime,
  formatUmagMoney,
  supplyPaymentStatusLabel,
} from '../../../services/umagSettlementsService'
import './OperationDetailSheet.css'

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

function PaymentStatusBadge({ status }) {
  if (!status) return null
  return (
    <span className={`umag-op-detail__pay-status umag-op-detail__pay-status--${status}`}>
      {supplyPaymentStatusLabel(status)}
    </span>
  )
}

/**
 * Close-the-operation block: pay an open supply (money out) or mark an open
 * return received (money in). The two streams are never netted.
 */
function SettleBlock({ settlement, accounts, defaultAccountId = null, onSettle, onUnsettle }) {
  const [accountId, setAccountId] = useState('')
  const [accountTouched, setAccountTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  // The supplier's own payment method is preselected, so the account is not forgotten (the list of accounts may
  // arrive a moment after the window opens — hence the effect). A choice made by hand is never overwritten.
  useEffect(() => {
    if (accountTouched) return
    const known = defaultAccountId && accounts.some((account) => account.id === defaultAccountId)
    setAccountId(known ? defaultAccountId : '')
  }, [accounts, defaultAccountId, accountTouched])
  const isPayable = settlement.type === 'payable'

  async function run(action) {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  if (settlement.settled) {
    return (
      <div className="umag-op-detail__settle">
        <span className="umag-op-detail__settle-state">
          {isPayable ? 'Оплачено' : 'Возврат получен'}
          {settlement.settledAt ? ` · ${formatUmagDateTime(settlement.settledAt)}` : ''}
        </span>
        {onUnsettle ? (
          <button
            type="button"
            className="btn btn--outline"
            disabled={busy}
            onClick={() => void run(onUnsettle)}
          >
            {isPayable ? 'Отменить оплату' : 'Отменить получение'}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="umag-op-detail__settle">
      <select
        className="umag-op-detail__settle-account"
        value={accountId}
        onChange={(e) => {
          setAccountTouched(true)
          setAccountId(e.target.value)
        }}
        disabled={busy}
        aria-label={isPayable ? 'Счёт оплаты' : 'Счёт, на который пришёл возврат'}
      >
        <option value="">Без счёта</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        onClick={() => void run(() => onSettle(accountId || null))}
      >
        {busy ? 'Сохранение…' : isPayable ? 'Оплатить' : 'Получили возврат'}
      </button>
    </div>
  )
}

/**
 * The window for an open document — the one thing to do here is to pay (or to mark a return received): the document,
 * the sum, the deadline, the account and one big button. UMAG's own details (who received it, UMAG's account) are
 * not shown: they only confused the account being paid from.
 */
function PayDialog({ operation, headline, due, accounts, defaultAccountId, onSettle, onClose }) {
  const settlement = operation.settlement
  const isPayable = settlement.type === 'payable'
  const [accountId, setAccountId] = useState('')
  const [accountTouched, setAccountTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (accountTouched) return
    const known = defaultAccountId && accounts.some((account) => account.id === defaultAccountId)
    setAccountId(known ? defaultAccountId : '')
  }, [accounts, defaultAccountId, accountTouched])

  async function pay() {
    if (busy) return
    setBusy(true)
    try {
      await onSettle(accountId || null)
    } finally {
      setBusy(false)
    }
  }

  const amount = Math.abs(Number(operation.amount) || 0)
  return (
    <>
      <div className="umag-op-detail__head">
        <div>
          <h3 className="umag-op-detail__title">{headline.title}</h3>
          <p className="umag-op-detail__muted">
            {headline.when ? formatUmagDateTime(headline.when) : 'Дата неизвестна'}
          </p>
        </div>
        <button type="button" className="umag-op-detail__close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>

      <div className="umag-op-detail__pay-amount">
        <strong>{formatUmagMoney(amount)}</strong>
        {due ? (
          <span className={`umag-op-detail__pay-due umag-op-detail__pay-due--${due.tone}`}>
            {due.text.charAt(0).toUpperCase() + due.text.slice(1)}
          </span>
        ) : null}
      </div>

      <label className="umag-op-detail__pay-field">
        <span>{isPayable ? 'Счёт оплаты' : 'Счёт, на который пришёл возврат'}</span>
        <select
          className="umag-op-detail__settle-account"
          value={accountId}
          onChange={(e) => {
            setAccountTouched(true)
            setAccountId(e.target.value)
          }}
          disabled={busy}
        >
          <option value="">Без счёта</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <div className="umag-op-detail__pay-actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void pay()}>
          {busy ? 'Сохранение…' : isPayable ? 'Оплатить' : 'Получили возврат'}
        </button>
      </div>
    </>
  )
}

export default function OperationDetailSheet({
  operation,
  supplierName,
  onClose,
  canManage = false,
  onUnmark,
  paymentAccounts = [],
  defaultAccountId = null,
  onSettle,
  onUnsettle,
  due = null,
}) {
  const kind = operation?.kind
  const isPaymentDoc = kind === 'payment' || kind === 'refund'
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
        externalSource: source.external_source || 'umag',
        obligationId: source.obligation_id || null,
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

  const [unmarking, setUnmarking] = useState(false)

  // An open supply / return that this person may close: the focused pay dialog instead of the full details.
  const openToSettle = Boolean(
    !isPaymentDoc && canManage && operation?.settlement && !operation.settlement.settled && onSettle
  )
  const docTitle =
    kind === 'supply' || kind === 'return'
      ? `${headerFromHistory.title}${operation?.documentNumber ? ` № ${operation.documentNumber}` : ''}`
      : headerFromHistory.title

  const canUnmark =
    canManage &&
    kind === 'payment' &&
    headerFromHistory.externalSource === 'platform' &&
    headerFromHistory.obligationId != null

  async function handleUnmark() {
    if (!canUnmark || unmarking) return
    setUnmarking(true)
    try {
      await onUnmark?.(headerFromHistory.obligationId)
    } finally {
      setUnmarking(false)
    }
  }

  // Portalled to document.body — see the same note in
  // the other platform sheets: rendered inline, this "fixed"
  // backdrop would be contained by PullToRefresh's always-on
  // will-change:transform wrapper and center in the middle of the whole
  // page instead of the viewport.
  return createPortal(
    <div className="umag-op-detail__backdrop" role="presentation" onClick={onClose}>
      <div
        className="umag-op-detail"
        role="dialog"
        aria-modal="true"
        aria-label={headerFromHistory.title}
        onClick={(e) => e.stopPropagation()}
      >
        {openToSettle ? (
          <PayDialog
            operation={operation}
            headline={{ title: docTitle, when: headerFromHistory.when }}
            due={due}
            accounts={paymentAccounts}
            defaultAccountId={defaultAccountId}
            onSettle={onSettle}
            onClose={onClose}
          />
        ) : (
        <>
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

        {/* The action comes first: «Оплатить» / «Получили возврат» is what this window is opened for. */}
        {!isPaymentDoc && canManage && operation?.settlement && onSettle ? (
          <SettleBlock
            settlement={operation.settlement}
            accounts={paymentAccounts}
            defaultAccountId={defaultAccountId}
            onSettle={onSettle}
            onUnsettle={onUnsettle}
          />
        ) : null}

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
              {headerFromHistory.externalSource === 'platform' ? null : (
                <div>
                  <span>Документ UMAG</span>
                  <strong>{headerFromHistory.documentNumber || '—'}</strong>
                </div>
              )}
              <div>
                <span>Связанная приёмка</span>
                <strong>{headerFromHistory.linkedSupplyId || '—'}</strong>
              </div>
              {headerFromHistory.externalSource === 'platform' ? null : (
                <div>
                  <span>Связанный возврат</span>
                  <strong>{headerFromHistory.linkedReturnId || '—'}</strong>
                </div>
              )}
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
          {kind === 'supply' && !operation?.settlement ? (
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
              <strong>{headerFromHistory.userName || '—'}</strong>
            </div>
          ) : null}
          {!isPaymentDoc && kind === 'supply' ? (
            <div>
              <span>Счёт</span>
              <strong>{headerFromHistory.account || '—'}</strong>
            </div>
          ) : null}
          {!isPaymentDoc && kind === 'return' ? (
            <div>
              <span>Счета</span>
              <strong>
                {formatAccountNames(headerFromHistory.accountNames)}
              </strong>
            </div>
          ) : null}
        </div>

        {isPaymentDoc ? (
          <>
            <div className="umag-op-detail__empty">
              {headerFromHistory.externalSource === 'platform'
                ? 'Отмечено оплаченным на платформе, в карточке поставщика. Состав товарных позиций для этого типа записи не отслеживается.'
                : 'Платёжный документ UMAG. Состав товарных позиций для этого типа операции не загружается.'}
            </div>
            {canUnmark ? (
              <button
                type="button"
                className="btn btn-secondary umag-op-detail__unmark"
                onClick={() => void handleUnmark()}
                disabled={unmarking}
              >
                {unmarking ? 'Отмена оплаты…' : 'Отменить оплату'}
              </button>
            ) : null}
          </>
        ) : (
          <>
        {headerFromHistory.comment || headerFromHistory.note ? (
          <p className="umag-op-detail__comment">{headerFromHistory.comment || headerFromHistory.note}</p>
        ) : null}
          </>
        )}
        </>
        )}
      </div>
    </div>,
    window.document.body
  )
}
