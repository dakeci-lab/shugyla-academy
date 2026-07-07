import { CATEGORIES } from '../data/roles'
import './CategoryFilter.css'

/**
 * Фильтр категорий курсов — горизонтальные кнопки-табы
 */
export default function CategoryFilter({ active, onChange }) {
  return (
    <div className="category-filter">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          className={`category-filter__btn ${active === cat.id ? 'category-filter__btn--active' : ''}`}
          onClick={() => onChange(cat.id)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}
