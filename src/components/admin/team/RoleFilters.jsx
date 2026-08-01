import { ROLE_FILTERS } from './teamManagementUtils'

export default function RoleFilters({ value, onChange }) {
  return (
    <div className="team-role-filters" role="group" aria-label="Фильтры ролей">
      {ROLE_FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className={`team-role-filters__chip${value === filter.id ? ' team-role-filters__chip--active' : ''}`}
          aria-pressed={value === filter.id}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}
