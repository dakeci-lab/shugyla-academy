import './admin-shared.css'
import './EmployeeSearchToolbar.css'

/** Единая строка поиска сотрудника для «График работы» и «Рейтинг» */
export default function EmployeeSearchToolbar({ value, onChange, placeholder = 'Имя или фамилия' }) {
  return (
    <div className="admin-toolbar admin-toolbar--stack employee-search-toolbar">
      <label className="admin-form__label employee-search-toolbar__field">
        Поиск сотрудника
        <input
          className="admin-form__input employee-search-toolbar__input"
          type="search"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
    </div>
  )
}
