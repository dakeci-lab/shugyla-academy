import { formatPriceCheckerMoney } from '../../../services/umagPriceCheckerService'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '—'
  }
}

function statusLabel(status) {
  if (status === 'found') return 'Найден'
  if (status === 'not_found') return 'Не найден'
  if (status === 'error') return 'Ошибка'
  return status
}

export default function PriceCheckerHistory({ items = [] }) {
  if (!items.length) {
    return (
      <section className="price-checker-history" aria-label="История проверок">
        <h2 className="price-checker-history__title">История проверок</h2>
        <p className="price-checker-history__empty">
          История текущей сессии пуста. После проверок здесь появятся последние 10 записей.
        </p>
      </section>
    )
  }

  return (
    <section className="price-checker-history" aria-label="История проверок">
      <h2 className="price-checker-history__title">История проверок</h2>
      <div className="price-checker-history__table-wrap">
        <table className="price-checker-history__table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Штрих-код</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{formatTime(item.at)}</td>
                <td className="price-checker-history__mono">{item.barcode}</td>
                <td>{item.name || '—'}</td>
                <td>
                  {item.status === 'found' && item.sellingPrice != null
                    ? formatPriceCheckerMoney(item.sellingPrice)
                    : '—'}
                </td>
                <td>
                  <span
                    className={`price-checker-history__status price-checker-history__status--${item.status}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
