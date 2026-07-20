import { buildPriceTagViewModel } from '../../utils/priceTags/priceTagModel'
import './PriceTagPreview.css'

/** Live on-screen preview — same view-model as print. */
export default function PriceTagPreview({ draft, type, sizeId }) {
  const view = buildPriceTagViewModel(draft || {}, { type, sizeId })
  const { size } = view
  const scale = Math.min(1, 280 / size.widthMm, 360 / size.heightMm)
  const widthPx = size.widthMm * 3.2 * scale
  const heightPx = size.heightMm * 3.2 * scale

  return (
    <div className="price-tag-preview">
      <div className="price-tag-preview__meta">
        <span>{size.label}</span>
        <span>{view.isPromo ? 'Акционный' : 'Обычный'}</span>
      </div>
      <div className="price-tag-preview__stage">
        <article
          className={`price-tag-card${view.isPromo ? ' price-tag-card--promo' : ''}`}
          style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
          aria-label="Предпросмотр ценника"
        >
          <div className="price-tag-card__top">
            <h3 className="price-tag-card__name">{view.name}</h3>
            {view.unitLabel ? <p className="price-tag-card__unit">{view.unitLabel}</p> : null}
            {view.description ? (
              <p className="price-tag-card__desc">{view.description}</p>
            ) : null}
          </div>
          <div className="price-tag-card__bottom">
            {view.showOldPrice ? (
              <p className="price-tag-card__old-price">{view.oldPriceLabel}</p>
            ) : null}
            <p className="price-tag-card__price">{view.priceLabel}</p>
            {view.barcode ? (
              <div className="price-tag-card__barcode">
                <span className="price-tag-card__barcode-bars" aria-hidden="true" />
                <span className="price-tag-card__barcode-text">{view.barcode}</span>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  )
}
