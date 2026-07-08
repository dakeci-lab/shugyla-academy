import { getDataModeLabel, getDataModeVariant } from '../../lib/dataMode'
import './DataModeBadge.css'

/** Бейдж режима хранения данных */
export default function DataModeBadge() {
  const label = getDataModeLabel()
  const variant = getDataModeVariant()

  return (
    <span className={`data-mode-badge data-mode-badge--${variant}`} title={label}>
      {label}
    </span>
  )
}
