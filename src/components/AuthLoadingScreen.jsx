import '../context/AcademyDataContext.css'

/** Экран загрузки при проверке сессии авторизации */
export default function AuthLoadingScreen() {
  return (
    <div className="academy-data-loading">
      <div className="academy-data-loading__card">
        <div className="academy-data-loading__logo" aria-hidden="true">
          S
        </div>
        <h1 className="academy-data-loading__brand">Shugyla Platform</h1>
        <span className="academy-data-loading__spinner" aria-hidden />
        <p>Проверка авторизации…</p>
      </div>
    </div>
  )
}
