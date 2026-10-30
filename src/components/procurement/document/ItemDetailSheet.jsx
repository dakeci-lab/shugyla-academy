import AdminModal from '../../admin/AdminModal'
import { calcLineTotal, formatPurchaseAmount } from '../../../utils/purchaseData'
import './ItemDetailSheet.css'

/**
 * «Товар» — позиция документа в окне снизу (телефон): название, штрихкод, остаток и продажи,
 * поля «Количество / Цена / Итого». Закупщик правит количество, приёмщик только смотрит.
 */
export default function ItemDetailSheet({
  item,
  editable,
  qtyValue,
  onQtyChange,
  onQtyCommit,
  onRemove,
  onClose,
  busy = false,
}) {
  function close() {
    onQtyCommit?.(item)
    onClose()
  }

  const qty = qtyValue !== undefined ? qtyValue : item.orderQty
  const unit = item.unit || 'шт.'

  return (
    <AdminModal
      sheet
      title="Товар"
      onClose={close}
      autoFocusClose={false}
      footer={
        <>
          {editable ? (
            <button
              type="button"
              className="btn btn--outline idsheet__remove"
              disabled={busy}
              onClick={() => {
                onClose()
                onRemove(item)
              }}
            >
              Убрать
            </button>
          ) : null}
          <button type="button" className="btn btn--primary" onClick={close}>
            Готово
          </button>
        </>
      }
    >
      <dl className="idsheet__rows">
        <div>
          <dt>Название</dt>
          <dd>{item.productName}</dd>
        </div>
        <div>
          <dt>Штрихкод</dt>
          <dd className="num">{item.barcode || '—'}</dd>
        </div>
        {editable ? (
          <>
            <div>
              <dt>Остаток</dt>
              <dd className="num">{item.stock}</dd>
            </div>
            <div>
              <dt>Продажи в день</dt>
              <dd className="num">{Number(item.salesPerDay || 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Рекомендация</dt>
              <dd className="num">{item.recommendation}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className="idsheet__fields">
        <label className="idsheet__field">
          <span>Количество, {unit}</span>
          {editable ? (
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={qty}
              onChange={(event) => onQtyChange(item.id, event.target.value)}
              onBlur={() => onQtyCommit?.(item)}
            />
          ) : (
            <output>{item.orderQty}</output>
          )}
        </label>
        <div className="idsheet__field">
          <span>Цена закупочная, ₸</span>
          <output>{formatPurchaseAmount(item.purchasePrice)}</output>
        </div>
        <div className="idsheet__field idsheet__field--wide">
          <span>Итого</span>
          <output>{formatPurchaseAmount(calcLineTotal(qty, item.purchasePrice))}</output>
        </div>
      </div>
    </AdminModal>
  )
}
