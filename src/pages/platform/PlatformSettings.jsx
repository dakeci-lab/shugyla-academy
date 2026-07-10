import { Link } from 'react-router-dom'
import DataModeBadge from '../../components/admin/DataModeBadge'
import MigrateToCloudPanel from '../../components/admin/MigrateToCloudPanel'
import { isCloudMode, getDataModeLabel } from '../../lib/dataMode'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import AttendanceSettingsPanel from '../../components/admin/AttendanceSettingsPanel'
import '../../components/admin/admin-shared.css'
import './PlatformSettings.css'

/** Настройки платформы */
export default function PlatformSettings() {
  const cloudMode = isCloudMode()
  const supabaseConfigured = isSupabaseConfigured()

  return (
    <div className="platform-settings">
      <section className="admin-panel-card platform-settings__section">
        <h2 className="admin-panel-card__title">Режим работы</h2>
        <p className="admin-panel-card__desc">
          Текущий режим хранения и синхронизации данных.
        </p>
        <div className="platform-settings__mode">
          <DataModeBadge />
          <span className="platform-settings__mode-label">{getDataModeLabel()}</span>
        </div>
        <ul className="platform-settings__list">
          <li>
            Supabase env: {supabaseConfigured ? 'настроен' : 'не настроен'}
          </li>
          <li>
            Активный режим: {cloudMode ? 'облачный (Supabase)' : 'локальный (localStorage)'}
          </li>
        </ul>
      </section>

      {!cloudMode && (
        <section className="platform-settings__section">
          <MigrateToCloudPanel />
        </section>
      )}

      <AttendanceSettingsPanel />

      <section className="admin-panel-card platform-settings__section">
        <h2 className="admin-panel-card__title">Платформа</h2>
        <p className="admin-panel-card__desc">
          Shugyla Platform v0.1 — первый этап внутренней платформы магазина.
        </p>
        <p className="platform-settings__hint">
          Модули закупа, товаров и приёмки будут добавляться поэтапно.
          Модуль Academy работает в полном объёме через раздел{' '}
          <Link to="/platform/academy">Academy</Link>.
        </p>
      </section>
    </div>
  )
}
