import { CATEGORIES } from '../data/roles'
import { getCategoryLabel } from '../utils/i18n'
import { useLanguage } from '../context/LanguageContext'
import './CategoryFilter.css'

/** Фильтр категорий курсов — горизонтальные кнопки-табы */
export default function CategoryFilter({ active, onChange }) {
  const { lang } = useLanguage()

  return (
    <div className="category-filter">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          className={`category-filter__btn ${active === cat.id ? 'category-filter__btn--active' : ''}`}
          onClick={() => onChange(cat.id)}
        >
          {getCategoryLabel(cat.id, lang)}
        </button>
      ))}
    </div>
  )
}
