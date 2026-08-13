import { Fragment, useId, useRef } from 'react'
import { TrashIcon } from '../icons/PlatformIcons'
import './ReceivingItemsTable.css'

const DISCREPANCY_REASONS = [
  { label: '', code: '' },
  { label: 'Недопоставка', code: 'quantity_mismatch' },
  { label: 'Не привезли', code: 'not_delivered' },
  { label: 'Повреждение', code: 'damaged' },
  { label: 'Излишек', code: 'quantity_mismatch' },
  { label: 'Изменение цены', code: 'price_changed' },
  { label: 'Вне заказа', code: 'other' },
  { label: 'Ошибка в заказе', code: 'other' },
  { label: 'Другое', code: 'other' },
]

const REASON_LABEL_BY_CODE = Object.freeze({
  damaged: 'Повреждение',
  not_delivered: 'Не привезли',
  quantity_mismatch: 'Недопоставка',
  price_changed: 'Изменение цены',
  other: 'Другое',
})

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function almostEqual(left, right) {
  return Math.abs(finiteNumber(left) - finiteNumber(right)) < 0.000001
}

export function isPieceUnit(unit) {
  const normalized = String(unit || '').trim().toLocaleLowerCase('ru-RU')
  return ['шт', 'шт.', 'штука', 'штуки', 'штук', 'pc', 'pcs', 'piece'].includes(normalized)
}

export function getReceivingItemFlags(item) {
  const orderedQty = finiteNumber(item?.orderedQty)
  const receivedQty = finiteNumber(item?.receivedQty)
  const orderedPrice = finiteNumber(item?.orderedPurchasePrice ?? item?.purchasePrice)
  const actualPrice = finiteNumber(item?.actualPurchasePrice ?? item?.purchasePrice)
  const outsideOrder = Boolean(item?.isOutsideOrder)

  return {
    orderedQty,
    receivedQty,
    differenceQty: receivedQty - orderedQty,
    orderedPrice,
    actualPrice,
    qtyChanged: !almostEqual(receivedQty, orderedQty),
    priceChanged: !almostEqual(actualPrice, orderedPrice),
    outsideOrder,
    hasException:
      outsideOrder ||
      !almostEqual(receivedQty, orderedQty) ||
      !almostEqual(actualPrice, orderedPrice),
  }
}

export function hasReceivingItemException(item) {
  return getReceivingItemFlags(item).hasException
}

function formatNumber(value, maximumFractionDigits = 3) {
  return finiteNumber(value).toLocaleString('ru-RU', { maximumFractionDigits })
}

function formatMoney(value) {
  return `${finiteNumber(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₸`
}

function getUnitLabel(item) {
  return String(item?.unit || '').trim()
}

function formatQuantity(value, item) {
  const unit = getUnitLabel(item)
  return `${formatNumber(value)}${unit ? ` ${unit}` : ''}`
}

function getReasonLabel(item) {
  const reason = String(item?.discrepancyReason || '').trim()
  if (reason === 'quantity_mismatch') {
    return finiteNumber(item?.receivedQty) > finiteNumber(item?.orderedQty)
      ? 'Излишек'
      : 'Недопоставка'
  }
  if (reason) return REASON_LABEL_BY_CODE[reason] || reason
  if (item?.discrepancyReasonCode === 'quantity_mismatch') {
    return finiteNumber(item?.receivedQty) > finiteNumber(item?.orderedQty)
      ? 'Излишек'
      : 'Недопоставка'
  }
  return REASON_LABEL_BY_CODE[item?.discrepancyReasonCode] || ''
}

function getPhotoUrl(photo) {
  return typeof photo === 'string' ? photo : photo?.url || ''
}

function isViewablePhotoUrl(value) {
  const url = String(value || '').trim()
  return /^(https?:|blob:|data:image\/)/i.test(url)
}

function getPhotoLabel(item, index) {
  return item?.photoMetadata?.[index]?.fileName || `Фото ${index + 1}`
}

function PersistedPhoto({ item, photo, index, compact = false }) {
  const url = getPhotoUrl(photo)
  const label = getPhotoLabel(item, index)
  const text = compact ? `фото ${index + 1}` : label

  if (!isViewablePhotoUrl(url)) {
    return (
      <span className="receiving-item-photos__chip" title="Фото сохранено">
        {text}
      </span>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={compact ? undefined : 'receiving-item-photos__chip'}
      aria-label={`Открыть ${label}`}
    >
      {compact ? text : (
        <>
          <img src={url} alt="" />
          <span>{text}</span>
        </>
      )}
    </a>
  )
}

function ExceptionBadges({ item }) {
  const flags = getReceivingItemFlags(item)
  const labels = []

  if (flags.outsideOrder) labels.push({ label: 'Вне заказа', tone: 'outside' })
  if (flags.differenceQty < 0) {
    labels.push({
      label: `Недопоставка ${formatNumber(Math.abs(flags.differenceQty))}`,
      tone: 'shortage',
    })
  }
  if (flags.differenceQty > 0) {
    labels.push({ label: `Излишек +${formatNumber(flags.differenceQty)}`, tone: 'surplus' })
  }
  if (flags.priceChanged) labels.push({ label: 'Цена изменена', tone: 'price' })
  if (labels.length === 0) labels.push({ label: 'Совпадает', tone: 'match' })

  return (
    <div className="receiving-item-statuses">
      {labels.map(({ label, tone }) => (
        <span key={`${tone}-${label}`} className={`receiving-item-status is-${tone}`}>
          {label}
        </span>
      ))}
    </div>
  )
}

function PhotoField({ item, rowIndex, onChangeItem }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const persistedPhotos = item.photoUrls || []
  const pendingFiles = item.pendingPhotoFiles || []

  function addFiles(event) {
    const files = Array.from(event.target.files || [])
    if (files.length > 0) {
      onChangeItem(rowIndex, {
        pendingPhotoFiles: [...pendingFiles, ...files],
      })
    }
    event.target.value = ''
  }

  return (
    <div className="receiving-item-photos">
      <label
        htmlFor={inputId}
        className="receiving-item-photos__button"
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          inputRef.current?.click()
        }}
      >
        Добавить фото
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="receiving-item-photos__input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,.heic"
        capture="environment"
        multiple
        tabIndex={-1}
        onChange={addFiles}
      />
      {persistedPhotos.map((photo, index) => (
        <PersistedPhoto
          key={getPhotoUrl(photo) || index}
          item={item}
          photo={photo}
          index={index}
        />
      ))}
      {pendingFiles.map((file, index) => (
        <span key={`${file.name}-${file.lastModified}-${index}`} className="receiving-item-photos__chip">
          {file.name}
          <button
            type="button"
            onClick={() =>
              onChangeItem(rowIndex, {
                pendingPhotoFiles: pendingFiles.filter((_, fileIndex) => fileIndex !== index),
              })
            }
            aria-label={`Убрать фото ${file.name}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

function EditableExceptionDetails({ item, rowIndex, onChangeItem }) {
  const selectedReason = getReasonLabel(item)

  return (
    <div className="receiving-item-details">
      <label>
        <span>Причина расхождения</span>
        <select
          value={selectedReason}
          onChange={(event) => {
            const selected = DISCREPANCY_REASONS.find(
              ({ label }) => label === event.target.value
            )
            onChangeItem(rowIndex, {
              discrepancyReason: selected?.label || '',
              discrepancyReasonCode: selected?.code || '',
            })
          }}
        >
          {DISCREPANCY_REASONS.map(({ label }) => (
            <option key={label || 'empty'} value={label}>
              {label || 'Не указана'}
            </option>
          ))}
        </select>
      </label>
      <label className="receiving-item-details__comment">
        <span>Комментарий <small>необязательно</small></span>
        <input
          type="text"
          value={item.comment || ''}
          placeholder="Например, повреждена упаковка"
          onChange={(event) => onChangeItem(rowIndex, { comment: event.target.value })}
        />
      </label>
      <div>
        <span className="receiving-item-details__label">Подтверждение</span>
        <PhotoField item={item} rowIndex={rowIndex} onChangeItem={onChangeItem} />
      </div>
    </div>
  )
}

function ReadOnlyExceptionDetails({ item }) {
  const photos = item.photoUrls || []
  const reasonLabel = getReasonLabel(item)
  if (!reasonLabel && !item.comment && photos.length === 0) return null

  return (
    <div className="receiving-item-details receiving-item-details--readonly">
      {reasonLabel ? (
        <span><strong>Причина:</strong> {reasonLabel}</span>
      ) : null}
      {item.comment ? <span><strong>Комментарий:</strong> {item.comment}</span> : null}
      {photos.length > 0 ? (
        <span>
          <strong>Фото:</strong>{' '}
          {photos.map((photo, index) => (
            <Fragment key={getPhotoUrl(photo) || index}>
              {index > 0 ? ', ' : ''}
              <PersistedPhoto item={item} photo={photo} index={index} compact />
            </Fragment>
          ))}
        </span>
      ) : null}
    </div>
  )
}

function QuantityInput({ item, rowIndex, onChangeItem }) {
  const unit = getUnitLabel(item)
  return (
    <label className="receiving-items__number-input">
      <input
        type="number"
        min="0"
        step={isPieceUnit(unit) ? '1' : '0.001'}
        value={item.receivedQty}
        onChange={(event) => onChangeItem(rowIndex, { receivedQty: event.target.value })}
        aria-label={`Фактическое количество: ${item.productName}`}
      />
      {unit ? <span>{unit}</span> : null}
    </label>
  )
}

function PriceInput({ item, rowIndex, onChangeItem }) {
  const flags = getReceivingItemFlags(item)
  return (
    <label className={`receiving-items__price-input${flags.priceChanged ? ' is-changed' : ''}`}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={item.actualPurchasePrice}
        onChange={(event) => onChangeItem(rowIndex, { actualPurchasePrice: event.target.value })}
        aria-label={`Фактическая закупочная цена: ${item.productName}`}
      />
      <span>₸</span>
    </label>
  )
}

function MobileReceivingItem({ item, rowIndex, readOnly, onChangeItem, onRemoveItem }) {
  const flags = getReceivingItemFlags(item)
  const showDetails =
    flags.hasException || item.discrepancyReason || item.comment ||
    (item.photoUrls || []).length > 0 || (item.pendingPhotoFiles || []).length > 0

  return (
    <article
      className={[
        'receiving-item-card',
        flags.outsideOrder ? 'is-outside-order' : '',
        flags.qtyChanged ? 'has-quantity-change' : '',
        flags.priceChanged ? 'has-price-change' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="receiving-item-card__header">
        <span className="receiving-item-card__number">{rowIndex + 1}</span>
        <div>
          <strong>{item.productName}</strong>
          <small>
            {item.barcode || 'Без штрихкода'}
            {getUnitLabel(item) ? ` · ${getUnitLabel(item)}` : ''}
          </small>
        </div>
        {!readOnly && flags.outsideOrder ? (
          <button
            type="button"
            className="receiving-items__remove"
            onClick={() => onRemoveItem(rowIndex)}
            aria-label={`Убрать ${item.productName}`}
          >
            <TrashIcon size={17} />
          </button>
        ) : null}
      </div>

      <dl className="receiving-item-card__values">
        <div><dt>Заказано</dt><dd>{formatQuantity(flags.orderedQty, item)}</dd></div>
        <div>
          <dt>Принято</dt>
          <dd>{readOnly ? formatQuantity(flags.receivedQty, item) : (
            <QuantityInput item={item} rowIndex={rowIndex} onChangeItem={onChangeItem} />
          )}</dd>
        </div>
        <div><dt>Цена заказа</dt><dd>{formatMoney(flags.orderedPrice)}</dd></div>
        <div>
          <dt>Фактическая цена</dt>
          <dd>{readOnly ? formatMoney(flags.actualPrice) : (
            <PriceInput item={item} rowIndex={rowIndex} onChangeItem={onChangeItem} />
          )}</dd>
        </div>
      </dl>

      <ExceptionBadges item={item} />
      {showDetails ? (
        readOnly ? (
          <ReadOnlyExceptionDetails item={item} />
        ) : (
          <EditableExceptionDetails item={item} rowIndex={rowIndex} onChangeItem={onChangeItem} />
        )
      ) : null}
    </article>
  )
}

export default function ReceivingItemsTable({
  items = [],
  readOnly = false,
  exceptionsOnly = false,
  onChangeItem = () => {},
  onRemoveItem = () => {},
}) {
  const rows = items
    .map((item, index) => ({ item, rowIndex: index }))
    .filter(({ item }) => !exceptionsOnly || hasReceivingItemException(item))

  if (rows.length === 0) {
    return (
      <div className="receiving-items__empty">
        {exceptionsOnly ? 'Расхождений нет — всё совпадает с заказом.' : 'В документе нет позиций.'}
      </div>
    )
  }

  return (
    <>
      <div className="receiving-items-table-wrap">
        <table className="receiving-items-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Товар</th>
              <th>Заказано</th>
              <th>Принято</th>
              <th>Цена заказа</th>
              <th>Фактическая цена</th>
              <th>Результат</th>
              {!readOnly ? <th aria-label="Действия" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, rowIndex }) => {
              const flags = getReceivingItemFlags(item)
              const showDetails =
                flags.hasException || item.discrepancyReason || item.comment ||
                (item.photoUrls || []).length > 0 || (item.pendingPhotoFiles || []).length > 0
              return (
                <Fragment key={item.id || `${item.barcode}-${rowIndex}`}>
                  <tr
                    className={[
                      flags.outsideOrder ? 'is-outside-order' : '',
                      flags.qtyChanged ? 'has-quantity-change' : '',
                      flags.priceChanged ? 'has-price-change' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="receiving-items__index">{rowIndex + 1}</td>
                    <td className="receiving-items__product">
                      <strong>{item.productName}</strong>
                      <span>
                        {item.barcode || 'Без штрихкода'}
                        {getUnitLabel(item) ? ` · ${getUnitLabel(item)}` : ''}
                      </span>
                    </td>
                    <td>{formatQuantity(flags.orderedQty, item)}</td>
                    <td>
                      {readOnly ? (
                        formatQuantity(flags.receivedQty, item)
                      ) : (
                        <QuantityInput item={item} rowIndex={rowIndex} onChangeItem={onChangeItem} />
                      )}
                    </td>
                    <td>{formatMoney(flags.orderedPrice)}</td>
                    <td>
                      {readOnly ? (
                        formatMoney(flags.actualPrice)
                      ) : (
                        <PriceInput item={item} rowIndex={rowIndex} onChangeItem={onChangeItem} />
                      )}
                    </td>
                    <td><ExceptionBadges item={item} /></td>
                    {!readOnly ? (
                      <td>
                        {flags.outsideOrder ? (
                          <button
                            type="button"
                            className="receiving-items__remove"
                            onClick={() => onRemoveItem(rowIndex)}
                            aria-label={`Убрать ${item.productName}`}
                          >
                            <TrashIcon size={17} />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                  {showDetails ? (
                    <tr className="receiving-items__details-row">
                      <td colSpan={readOnly ? 7 : 8}>
                        {readOnly ? (
                          <ReadOnlyExceptionDetails item={item} />
                        ) : (
                          <EditableExceptionDetails
                            item={item}
                            rowIndex={rowIndex}
                            onChangeItem={onChangeItem}
                          />
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="receiving-items-mobile">
        {rows.map(({ item, rowIndex }) => (
          <MobileReceivingItem
            key={item.id || `${item.barcode}-${rowIndex}`}
            item={item}
            rowIndex={rowIndex}
            readOnly={readOnly}
            onChangeItem={onChangeItem}
            onRemoveItem={onRemoveItem}
          />
        ))}
      </div>
    </>
  )
}
