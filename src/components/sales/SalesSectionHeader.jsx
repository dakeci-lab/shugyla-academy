import './SalesShared.css'

/** Numbered section heading — "01 Воронка прибыли", "02 Динамика выручки и маржи" — matches the reference dashboard's section structure. */
export default function SalesSectionHeader({ index, title }) {
  return (
    <div className="sales-section-header">
      <span className="sales-section-header__num">{String(index).padStart(2, '0')}</span>
      <h3 className="sales-section-header__title">{title}</h3>
    </div>
  )
}
