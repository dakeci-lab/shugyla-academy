import AttendanceSettingsPanel from '../../components/admin/AttendanceSettingsPanel'
import '../../components/admin/admin-shared.css'
import './PlatformSettings.css'

/** Управление тайм-трекером: рабочая территория и штрафные баллы */
export default function PlatformSettingsGeneral() {
  return (
    <div className="platform-settings">
      <AttendanceSettingsPanel />
    </div>
  )
}
