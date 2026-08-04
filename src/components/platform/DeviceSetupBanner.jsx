import { useDevicePermissionsContext } from '../../context/DevicePermissionsContext'
import './DeviceSetupBanner.css'

/** Soft reminder after «Не сейчас» — does not re-open the modal in the same session. */
export default function DeviceSetupBanner({ onOpenSetup }) {
  const { state, showBanner } = useDevicePermissionsContext()

  if (!showBanner || !state) return null

  return (
    <aside className="device-setup-banner" role="status">
      <div className="device-setup-banner__text">
        <strong>Требуется настройка</strong>
        <span>
          {state.uiConnectionLabel}. Откройте профиль, чтобы подключить уведомления и геолокацию.
        </span>
      </div>
      <button type="button" className="device-setup-banner__action" onClick={onOpenSetup}>
        Настроить
      </button>
    </aside>
  )
}
