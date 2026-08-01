import Can from '../../auth/Can'
import { PERMISSION_CODES } from '../../../config/permissions'

export default function UnsavedChangesBar({ visible, saving, onCancel, onSave }) {
  if (!visible) return null

  return (
    <div className="team-unsaved-bar" role="status" aria-live="polite">
      <span className="team-unsaved-bar__text">Есть несохранённые изменения</span>
      <div className="team-unsaved-bar__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Отменить изменения
        </button>
        <Can anyOf={[PERMISSION_CODES.ROLES_EDIT, PERMISSION_CODES.ROLES_ASSIGN_PERMISSIONS]}>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </Can>
      </div>
    </div>
  )
}
