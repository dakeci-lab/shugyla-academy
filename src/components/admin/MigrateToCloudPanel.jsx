import { useState } from 'react'
import { isCloudMode } from '../../lib/dataMode'
import { migrateLocalDataToCloud } from '../../services/academyDataService'
import { useAcademyData } from '../../context/AcademyDataContext'
import './MigrateToCloudPanel.css'

/** Перенос localStorage данных в Supabase */
export default function MigrateToCloudPanel() {
  const { reload } = useAcademyData()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  if (!isCloudMode()) return null

  async function handleMigrate() {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const counts = await migrateLocalDataToCloud()
      setResult(counts)
      await reload()
    } catch (err) {
      setError(err.message || 'Не удалось перенести данные')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="admin-panel-card migrate-cloud-panel">
      <div className="admin-panel-card__header">
        <h2 className="admin-panel-card__title">Облачное хранилище</h2>
        <p className="admin-panel-card__desc">
          Перенесите текущие данные из localStorage браузера в Supabase, чтобы они
          были доступны на всех устройствах.
        </p>
      </div>

      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={handleMigrate}
        disabled={loading}
      >
        {loading ? 'Перенос…' : 'Перенести локальные данные в облако'}
      </button>

      {result && (
        <div className="migrate-cloud-panel__result">
          <p>Данные успешно перенесены:</p>
          <ul>
            <li>Сотрудников: {result.employees}</li>
            <li>Курсов: {result.courses}</li>
            <li>Уроков: {result.lessons}</li>
            <li>Записей прогресса: {result.progress}</li>
          </ul>
        </div>
      )}

      {error && <p className="migrate-cloud-panel__error">{error}</p>}
    </section>
  )
}
