import { useMemo, useState } from 'react'
import useMediaQuery from '../../../hooks/useMediaQuery'
import { isPwaStandalone } from '../../../utils/pwaStandalone'
import PriceTagPreview from '../../../components/priceTags/PriceTagPreview'
import {
  PRICE_TAG_SIZES,
  PRICE_TAG_TYPE_OPTIONS,
  PRICE_TAG_TYPES,
  DEFAULT_PRICE_TAG_SIZE_ID,
  DEFAULT_PRICE_TAG_TYPE,
  createEmptyPriceTagDraft,
  validatePriceTagDraft,
  buildPriceTagViewModel,
} from '../../../utils/priceTags/priceTagModel'
import { printPriceTag } from '../../../utils/priceTags/priceTagPrint'
import { useToast } from '../../../context/ToastContext'
import '../../../components/admin/admin-shared.css'
import '../../../components/admin/AdminModal.css'
import './PriceTagsPage.css'

const DESKTOP_QUERY = '(min-width: 901px)'

/** First prototype: manual price-tag generator (WEB desktop only). */
export default function PriceTagsPage() {
  const { warning: showWarning, error: showError } = useToast()
  const isDesktopViewport = useMediaQuery(DESKTOP_QUERY)
  const pwaStandalone = isPwaStandalone()
  const webOnlyBlocked = !isDesktopViewport || pwaStandalone

  const [draft, setDraft] = useState(createEmptyPriceTagDraft)
  const [type, setType] = useState(DEFAULT_PRICE_TAG_TYPE)
  const [sizeId, setSizeId] = useState(DEFAULT_PRICE_TAG_SIZE_ID)
  const [errors, setErrors] = useState({})

  const previewDraft = useMemo(() => ({ ...draft, type }), [draft, type])

  function patchDraft(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  function handleClear() {
    setDraft(createEmptyPriceTagDraft())
    setType(DEFAULT_PRICE_TAG_TYPE)
    setSizeId(DEFAULT_PRICE_TAG_SIZE_ID)
    setErrors({})
  }

  function handlePrint() {
    const validation = validatePriceTagDraft({ ...draft, type })
    if (!validation.ok) {
      setErrors(validation.errors)
      showWarning('Заполните обязательные поля перед печатью')
      return
    }
    const viewModel = buildPriceTagViewModel(draft, { type, sizeId })
    const result = printPriceTag(viewModel)
    if (!result.ok) {
      showError(result.error)
    }
  }

  if (webOnlyBlocked) {
    return (
      <div className="price-tags-page price-tags-page--blocked">
        <div className="price-tags-page__blocked-card">
          <h2 className="price-tags-page__blocked-title">Печать ценников</h2>
          <p className="price-tags-page__blocked-text">
            Этот модуль доступен только в WEB-версии на компьютере. Печать ценников
            не поддерживается в мобильном приложении и PWA.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="price-tags-page">
      <header className="price-tags-page__header">
        <div>
          <h1 className="price-tags-page__title">Печать ценников</h1>
          <p className="price-tags-page__subtitle">
            Ручной генератор ценников. Данные вводятся вручную — позже можно будет
            подставлять товары из каталога.
          </p>
        </div>
      </header>

      <div className="price-tags-page__layout">
        <section className="price-tags-page__panel" aria-label="Параметры ценника">
          <div className="price-tags-page__block">
            <h2 className="price-tags-page__block-title">Создание ценника</h2>
            <div className="admin-form">
              <label className="admin-form__label" htmlFor="price-tag-name">
                Название товара *
              </label>
              <input
                id="price-tag-name"
                className="admin-form__input"
                value={draft.name}
                onChange={(e) => patchDraft('name', e.target.value)}
                placeholder="Например: Молоко Шугала"
                autoComplete="off"
              />
              {errors.name ? <p className="admin-form__error">{errors.name}</p> : null}

              <div className="admin-form__row">
                <div>
                  <label className="admin-form__label" htmlFor="price-tag-volume">
                    Объём / вес
                  </label>
                  <input
                    id="price-tag-volume"
                    className="admin-form__input"
                    value={draft.volume}
                    onChange={(e) => patchDraft('volume', e.target.value)}
                    placeholder="0.5 л / 500 г"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="admin-form__label" htmlFor="price-tag-sku">
                    Артикул
                  </label>
                  <input
                    id="price-tag-sku"
                    className="admin-form__input"
                    value={draft.sku}
                    onChange={(e) => patchDraft('sku', e.target.value)}
                    placeholder="Необязательно"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="admin-form__row">
                <div>
                  <label className="admin-form__label" htmlFor="price-tag-price">
                    Цена *
                  </label>
                  <input
                    id="price-tag-price"
                    className="admin-form__input"
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(e) => patchDraft('price', e.target.value)}
                    placeholder="990"
                    autoComplete="off"
                  />
                  {errors.price ? <p className="admin-form__error">{errors.price}</p> : null}
                </div>
                <div>
                  <label className="admin-form__label" htmlFor="price-tag-old-price">
                    Старая цена
                  </label>
                  <input
                    id="price-tag-old-price"
                    className="admin-form__input"
                    inputMode="decimal"
                    value={draft.oldPrice}
                    onChange={(e) => patchDraft('oldPrice', e.target.value)}
                    placeholder="Для акции"
                    autoComplete="off"
                    disabled={type !== PRICE_TAG_TYPES.PROMO}
                  />
                  {errors.oldPrice ? (
                    <p className="admin-form__error">{errors.oldPrice}</p>
                  ) : null}
                </div>
              </div>

              <label className="admin-form__label" htmlFor="price-tag-description">
                Описание
              </label>
              <input
                id="price-tag-description"
                className="admin-form__input"
                value={draft.description}
                onChange={(e) => patchDraft('description', e.target.value)}
                placeholder="Высшее качество, новая партия…"
                autoComplete="off"
              />

              <label className="admin-form__label" htmlFor="price-tag-barcode">
                Штрихкод
              </label>
              <input
                id="price-tag-barcode"
                className="admin-form__input"
                value={draft.barcode}
                onChange={(e) => patchDraft('barcode', e.target.value)}
                placeholder="Позже — из базы товаров"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="price-tags-page__block">
            <h2 className="price-tags-page__block-title">Тип ценника</h2>
            <div className="price-tags-page__chips" role="radiogroup" aria-label="Тип ценника">
              {PRICE_TAG_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`price-tags-page__chip${type === option.id ? ' price-tags-page__chip--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="price-tag-type"
                    value={option.id}
                    checked={type === option.id}
                    onChange={() => setType(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="price-tags-page__block">
            <h2 className="price-tags-page__block-title">Размер ценника</h2>
            <label className="admin-form__label" htmlFor="price-tag-size">
              Формат
            </label>
            <select
              id="price-tag-size"
              className="admin-form__select"
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
            >
              {PRICE_TAG_SIZES.map((size) => (
                <option key={size.id} value={size.id}>
                  {size.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <aside className="price-tags-page__preview-panel" aria-label="Предпросмотр">
          <h2 className="price-tags-page__block-title">Предпросмотр</h2>
          <PriceTagPreview draft={previewDraft} type={type} sizeId={sizeId} />
        </aside>
      </div>

      <footer className="price-tags-page__actions">
        <button type="button" className="btn btn--outline" onClick={handleClear}>
          Очистить
        </button>
        <button type="button" className="btn btn--primary" onClick={handlePrint}>
          Печать
        </button>
      </footer>
    </div>
  )
}
