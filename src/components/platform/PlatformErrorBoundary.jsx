import { Component } from 'react'
import {
  createPlatformErrorId,
  isPwaShellLoadError,
  logPlatformBootstrapFailure,
  recoverPwaShell,
} from '../../pwa/pwaRecovery'
import { getAppUrl, isInsideAppBase } from '../../router/basename'
import './PlatformErrorBoundary.css'

/** Error boundary для оболочки платформы — не оставляет белый экран при runtime error */
export default class PlatformErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorId: null, retryKey: 0, recovering: false, loggingOut: false }
    this.handleRetry = this.handleRetry.bind(this)
    this.handleReload = this.handleReload.bind(this)
    this.handleLogout = this.handleLogout.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error, errorId: createPlatformErrorId() }
  }

  componentDidCatch(error, info) {
    logPlatformBootstrapFailure(error, {
      errorId: this.state.errorId,
      componentStack: info?.componentStack,
      shellLoadError: isPwaShellLoadError(error),
    })
  }

  handleRetry() {
    const previousErrorId = this.state.errorId
    console.info('Platform error boundary retry', {
      previousErrorId,
      pathname: window.location.pathname,
      href: window.location.href,
    })

    this.setState((current) => ({
      error: null,
      errorId: null,
      recovering: false,
      loggingOut: false,
      retryKey: current.retryKey + 1,
    }))
  }

  async handleReload() {
    if (this.state.recovering) return

    this.setState({ recovering: true })

    if (isPwaShellLoadError(this.state.error)) {
      await recoverPwaShell({ reason: 'error-boundary-reload' })
      return
    }

    if (isInsideAppBase()) {
      window.location.reload()
      return
    }

    window.location.replace(getAppUrl())
  }

  async handleLogout() {
    if (this.state.loggingOut) return

    this.setState({ loggingOut: true })

    try {
      if (this.props.onLogout) {
        await this.props.onLogout()
        return
      }
    } catch (error) {
      console.warn('Platform error boundary logout failed', {
        message: error?.message,
      })
    }

    window.location.replace(getAppUrl('login'))
  }

  render() {
    const { error, errorId, recovering, loggingOut } = this.state
    const { children } = this.props

    if (!error) {
      return <div key={this.state.retryKey}>{children}</div>
    }

    return (
      <div className="platform-error-boundary">
        <div className="platform-error-boundary__card">
          <h1 className="platform-error-boundary__title">Не удалось открыть платформу</h1>
          <p className="platform-error-boundary__text">
            Произошла ошибка при загрузке раздела. Попробуйте ещё раз или обновите приложение.
          </p>
          {errorId && (
            <p className="platform-error-boundary__meta">Код ошибки: {errorId}</p>
          )}
          <div className="platform-error-boundary__actions">
            <button type="button" className="btn btn--primary" onClick={this.handleRetry}>
              Повторить
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={this.handleReload}
              disabled={recovering}
            >
              {recovering ? 'Обновление…' : 'Обновить'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={this.handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Выход…' : 'Выйти из аккаунта'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
