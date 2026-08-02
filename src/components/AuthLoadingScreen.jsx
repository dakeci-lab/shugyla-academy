import '../context/PlatformDataContext.css'

/** Экран загрузки при проверке сессии авторизации */
export default function AuthLoadingScreen() {
  return (
    <div className="platform-data-loading">
      <div className="platform-data-loading__card">
        <div className="platform-data-loading__logo" aria-hidden="true">
          S
        </div>
        <h1 className="platform-data-loading__brand">Shugyla Platform</h1>
        <span className="platform-data-loading__spinner" aria-hidden />
        <p>Проверка авторизации…</p>
      </div>
    </div>
  )
}
