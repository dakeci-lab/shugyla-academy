import { formatPriceCheckerMoney } from '../../../services/umagPriceCheckerService'

function formatFetchedAt(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

export default function PriceCheckerResult({ status, product, fetchedAt, errorMessage }) {
  if (status === 'idle') {
    return (
      <div className="price-checker-result price-checker-result--idle">
        <p className="price-checker-result__idle-text">
          Отсканируйте штрих-код или введите его вручную
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="price-checker-result price-checker-result--loading" aria-busy="true">
        <div className="price-checker-result__skeleton price-checker-result__skeleton--title" />
        <div className="price-checker-result__skeleton price-checker-result__skeleton--price" />
        <div className="price-checker-result__skeleton price-checker-result__skeleton--meta" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="price-checker-result price-checker-result--error" role="alert">
        <p className="price-checker-result__error-text">
          {errorMessage || 'Не удалось получить данные из UMAG. Повторите попытку.'}
        </p>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="price-checker-result price-checker-result--empty" role="status">
        <p className="price-checker-result__empty-text">
          Товар с таким штрих-кодом не найден
        </p>
      </div>
    )
  }

  if (status !== 'found' || !product) {
    return null
  }

  return (
    <div className="price-checker-result price-checker-result--found">
      <div className="price-checker-result__badge">Данные UMAG</div>
      <h2 className="price-checker-result__name">{product.name}</h2>
      <p className="price-checker-result__price">
        {formatPriceCheckerMoney(product.sellingPrice)}
      </p>
      <dl className="price-checker-result__meta">
        <div>
          <dt>Штрих-код</dt>
          <dd>{product.barcode}</dd>
        </div>
        {product.categoryName ? (
          <div>
            <dt>Категория</dt>
            <dd>{product.categoryName}</dd>
          </div>
        ) : null}
        {product.unitName ? (
          <div>
            <dt>Ед. изм.</dt>
            <dd>{product.unitName}</dd>
          </div>
        ) : null}
        {fetchedAt ? (
          <div>
            <dt>Получено</dt>
            <dd>{formatFetchedAt(fetchedAt)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}
