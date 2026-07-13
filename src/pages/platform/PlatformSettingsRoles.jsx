import RolesAccessPage from '../../components/admin/roles/RolesAccessPage'
import '../../components/admin/admin-shared.css'

/** Страница «Роли и доступы» */
export default function PlatformSettingsRoles() {
  return (
    <div className="platform-settings">
      <section className="admin-panel-card platform-settings__section">
        <h2 className="admin-panel-card__title">Роли и доступы</h2>
        <p className="admin-panel-card__desc">
          Управление ролями сотрудников и матрицей разрешений по модулям платформы.
        </p>
        <RolesAccessPage />
      </section>
    </div>
  )
}
