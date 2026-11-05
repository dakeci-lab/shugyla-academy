import AdminModal from '../../admin/AdminModal'
import {
  calcLineTotal,
  clampDiscountPct,
  discountedPrice,
  formatPromo,
  formatPurchaseAmount,
  itemReceiveQty,
} from '../../../utils/purchaseData'
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
  onPromoCommit,
  onBonusCommit,
  onDiscountCommit,
  fieldValue,
  onFieldChange,
  onRemove,
  onClose,
  busy = false,
}) {
  function close() {
    onQtyCommit?.(item)
    onPromoCommit?.(item)
    onBonusCommit?.(item)
    onDiscountCommit?.(item)
    onClose()
  }

  const qty = qtyValue !== undefined ? qtyValue : item.orderQty
  const unit = item.unit || 'шт.'
  const discountText = fieldValue ? fieldValue(item.id, 'discount', item.discountPct || '') : item.discountPct || ''
  const discount = clampDiscountPct(discountText)

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
        {editable ? (
          <>
            <label className="idsheet__field">
              <span>Акция (5+1)</span>
              <input
                type="text"
                inputMode="text"
                placeholder="5+1"
                value={fieldValue(item.id, 'promo', formatPromo(item.promoBuy, item.promoFree))}
                onChange={(event) => onFieldChange(item.id, 'promo', event.target.value)}
                onBlur={() => onPromoCommit?.(item)}
              />
            </label>
            <label className="idsheet__field">
              <span>Бонус, {unit}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="0"
                value={fieldValue(item.id, 'bonus', item.bonusQty || '')}
                onChange={(event) => onFieldChange(item.id, 'bonus', event.target.value)}
                onBlur={() => onBonusCommit?.(item)}
              />
            </label>
            <label className="idsheet__field">
              <span>Скидка, %</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                placeholder="0"
                value={discountText}
                onChange={(event) => onFieldChange(item.id, 'discount', event.target.value)}
                onBlur={() => onDiscountCommit?.(item)}
              />
            </label>
          </>
        ) : (
          <>
            {item.bonusQty > 0 ? (
              <div className="idsheet__field">
                <span>Бонус, {unit}</span>
                <output>+{item.bonusQty}</output>
              </div>
            ) : null}
            {item.bonusQty > 0 ? (
              <div className="idsheet__field">
                <span>Привезут, {unit}</span>
                <output>{itemReceiveQty(item)}</output>
              </div>
            ) : null}
            {item.discountPct > 0 ? (
              <div className="idsheet__field">
                <span>Скидка, %</span>
                <output>{item.discountPct}%</output>
              </div>
            ) : null}
          </>
        )}
        <div className="idsheet__field">
          <span>Цена закупочная, ₸</span>
          <output>{formatPurchaseAmount(item.purchasePrice)}</output>
        </div>
        {discount > 0 ? (
          <div className="idsheet__field">
            <span>Цена со скидкой, ₸</span>
            <output>{formatPurchaseAmount(discountedPrice(item.purchasePrice, discount))}</output>
          </div>
        ) : null}
        <div className="idsheet__field idsheet__field--wide">
          <span>Итого</span>
          <output>{formatPurchaseAmount(calcLineTotal(qty, item.purchasePrice, discount))}</output>
        </div>
      </div>
    </AdminModal>
  )
}
