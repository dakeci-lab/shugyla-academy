import PlatformSearchToolbar from '../platform/PlatformSearchToolbar'

/** @deprecated Используйте PlatformSearchToolbar — оставлен как тонкая обёртка для совместимости */
export default function EmployeeSearchToolbar({
  value,
  onChange,
  placeholder = 'Поиск по ФИО',
}) {
  return (
    <PlatformSearchToolbar
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={placeholder}
      flush
    />
  )
}
