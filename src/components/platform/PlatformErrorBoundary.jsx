import { Component } from 'react'
import { LOGIN_PATH } from '../../router/authRoutes'
import './PlatformErrorBoundary.css'

/** Error boundary для оболочки платформы — не оставляет белый экран при runtime error */
export default class PlatformErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.handleRetry = this.handleRetry.bind(this)
    this.handleReload = this.handleReload.bind(this)
    this.handleLogout = this.handleLogout.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[PlatformErrorBoundary]', error, info?.componentStack)
    }
  }

  handleRetry() {
    this.setState({ error: null })
  }

  handleReload() {
    window.location.reload()
  }

  async handleLogout() {
    try {
      await this.props.onLogout?.()
    } catch {
      // ignore
    }
    window.location.assign(LOGIN_PATH)
  }

  render() {
    const { error } = this.state
    const { children } = this.props

    if (!error) return children

    return (
      <div className="platform-error-boundary">
        <div className="platform-error-boundary__card">
          <h1 className="platform-error-boundary__title">Не удалось открыть платформу</h1>
          <p className="platform-error-boundary__text">
            Произошла ошибка при загрузке раздела. Попробуйте ещё раз или войдите заново.
          </p>
          <div className="platform-error-boundary__actions">
            <button type="button" className="btn btn--primary" onClick={this.handleRetry}>
              Повторить
            </button>
            <button type="button" className="btn btn--outline" onClick={this.handleReload}>
              Обновить
            </button>
            <button type="button" className="btn btn--ghost" onClick={this.handleLogout}>
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    )
  }
}
