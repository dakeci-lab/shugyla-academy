import { useCallback, useEffect, useState } from 'react'
import { isCloudMode } from '../../../lib/dataMode'
import { useSession } from '../../../context/SessionContext'
import { useToast } from '../../../context/ToastContext'
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermission,
  getPushRegistrationStatus,
  getDeviceTestSendStatus,
  getTestSendPermitCountdownSeconds,
  hasAttemptedSendTestRequest,
  isPersistedTestSendPermitValid,
  isWebPushSupported,
  isProductionE2eTestSendEnabled,
  issueServerTestSendPermit,
  prepareDeviceForTestSend,
  PREPARE_TEST_SUCCESS_MESSAGE,
  PERMIT_ISSUE_SUCCESS_MESSAGE,
  preflightServerTestWebPush,
  readPersistedSendTestDiagnostic,
  readPersistedSendTestRequest,
  readPersistedTestSendPermit,
  sendServerTestWebPush,
  showDevelopmentTestNotification,
  WebPushError,
  WEB_PUSH_ERROR_MESSAGES,
} from '../../../services/webPushSubscriptionService'
import './PushNotificationSettings.css'

const UI_STATE = {
  LOADING: 'loading',
  UNSUPPORTED: 'unsupported',
  OFFLINE_MODE: 'offline_mode',
  DEFAULT: 'default',
  ENABLING: 'enabling',
  ENABLED: 'enabled',
  DENIED: 'denied',
  ERROR: 'error',
  DISABLED: 'disabled',
  DISABLING: 'disabling',
}

const SERVER_SEND_STATE = {
  IDLE: 'idle',
  SENDING: 'sending',
  SUCCESS: 'success',
  ERROR: 'error',
  BLOCKED: 'blocked',
}

const PREPARE_STATE = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  READY: 'ready',
  ERROR: 'error',
}

const PREFLIGHT_STATE = {
  IDLE: 'idle',
  CHECKING: 'checking',
  SUCCESS: 'success',
  ERROR: 'error',
}

const PERMIT_STATE = {
  IDLE: 'idle',
  ISSUING: 'issuing',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  USED: 'used',
  ERROR: 'error',
}

export default function PushNotificationSettings() {
  const { supabaseAuthenticated } = useSession()
  const { success: showSuccess, warning: showWarning } = useToast()
  const [uiState, setUiState] = useState(UI_STATE.LOADING)
  const [errorMessage, setErrorMessage] = useState('')
  const [serverSendState, setServerSendState] = useState(SERVER_SEND_STATE.IDLE)
  const [serverSendMessage, setServerSendMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [prepareState, setPrepareState] = useState(PREPARE_STATE.IDLE)
  const [prepareMessage, setPrepareMessage] = useState('')
  const [testReady, setTestReady] = useState(false)
  const [preflightState, setPreflightState] = useState(PREFLIGHT_STATE.IDLE)
  const [preflightMessage, setPreflightMessage] = useState('')
  const [preflightSummary, setPreflightSummary] = useState('')
  const [permitState, setPermitState] = useState(PERMIT_STATE.IDLE)
  const [permitMessage, setPermitMessage] = useState('')
  const [permitExpiryLabel, setPermitExpiryLabel] = useState('')
  const [permitCountdownSeconds, setPermitCountdownSeconds] = useState(0)
  const [permitValid, setPermitValid] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!isCloudMode()) {
      setUiState(UI_STATE.OFFLINE_MODE)
      return
    }

    if (!supabaseAuthenticated) {
      setUiState(UI_STATE.DEFAULT)
      return
    }

    if (!isWebPushSupported()) {
      setUiState(UI_STATE.UNSUPPORTED)
      return
    }

    const permission = getNotificationPermission()
    if (permission === 'denied') {
      setUiState(UI_STATE.DENIED)
      return
    }

    try {
      const status = await getPushRegistrationStatus()
      if (status.active && status.registered) {
        setUiState(UI_STATE.ENABLED)
        return
      }
      if (status.registered && !status.active) {
        setUiState(UI_STATE.DISABLED)
        return
      }
      if (permission === 'granted' && status.syncPending) {
        setUiState(UI_STATE.ERROR)
        setErrorMessage('Не удалось синхронизировать подписку с сервером')
        return
      }
      setUiState(UI_STATE.DEFAULT)
    } catch (err) {
      setErrorMessage(err.message || 'Не удалось проверить состояние уведомлений')
      setUiState(UI_STATE.ERROR)
    }
  }, [supabaseAuthenticated])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const persisted = readPersistedSendTestDiagnostic()
    if (persisted?.message) {
      setServerSendState(SERVER_SEND_STATE.ERROR)
      setServerSendMessage(persisted.message)
    }
    if (readPersistedSendTestRequest()) {
      setServerSendState((current) =>
        current === SERVER_SEND_STATE.SUCCESS ? current : SERVER_SEND_STATE.BLOCKED
      )
    }
  }, [])

  useEffect(() => {
    const persistedPermit = readPersistedTestSendPermit()
    if (persistedPermit?.used) {
      setPermitState(PERMIT_STATE.USED)
      setPermitValid(false)
      return
    }
    if (persistedPermit && isPersistedTestSendPermitValid()) {
      setPermitState(PERMIT_STATE.ACTIVE)
      setPermitValid(true)
      setPermitExpiryLabel(
        new Date(persistedPermit.expiresAt).toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: '2-digit',
        })
      )
    } else if (persistedPermit) {
      setPermitState(PERMIT_STATE.EXPIRED)
      setPermitValid(false)
    }
  }, [])

  useEffect(() => {
    if (!isProductionE2eTestSendEnabled() || import.meta.env.DEV) return undefined

    const tick = () => {
      const seconds = getTestSendPermitCountdownSeconds()
      setPermitCountdownSeconds(seconds)
      const valid = isPersistedTestSendPermitValid()
      setPermitValid(valid)
      if (!valid && readPersistedTestSendPermit()) {
        setPermitState(PERMIT_STATE.EXPIRED)
      }
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [permitState])

  function resolveEnableErrorMessage(err) {
    if (err instanceof WebPushError && err.code && WEB_PUSH_ERROR_MESSAGES[err.code]) {
      return WEB_PUSH_ERROR_MESSAGES[err.code]
    }
    return err?.message || WEB_PUSH_ERROR_MESSAGES.backend_registration_failed
  }

  async function handleEnable() {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setUiState(UI_STATE.ENABLING)
    try {
      await enablePushNotifications()
      setUiState(UI_STATE.ENABLED)
      showSuccess('Уведомления на этом устройстве включены')
    } catch (err) {
      if (
        err instanceof WebPushError &&
        err.code === 'permission_denied'
      ) {
        setUiState(UI_STATE.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      if (getNotificationPermission() === 'denied') {
        setUiState(UI_STATE.DENIED)
        showWarning(WEB_PUSH_ERROR_MESSAGES.permission_denied)
        return
      }
      setErrorMessage(resolveEnableErrorMessage(err))
      setUiState(UI_STATE.ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setUiState(UI_STATE.DISABLING)
    try {
      await disablePushNotifications()
      setUiState(UI_STATE.DISABLED)
      showSuccess('Уведомления отключены')
    } catch (err) {
      setErrorMessage(resolveEnableErrorMessage(err))
      setUiState(UI_STATE.ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function handleDevTest() {
    try {
      await showDevelopmentTestNotification()
    } catch (err) {
      showWarning(err.message || 'Не удалось показать тестовое уведомление')
    }
  }

  async function handlePrepareTest() {
    if (prepareState === PREPARE_STATE.PREPARING || busy) return
    setPrepareState(PREPARE_STATE.PREPARING)
    setPrepareMessage('')
    setTestReady(false)
    try {
      const status = await prepareDeviceForTestSend()
      setTestReady(Boolean(status.testReady))
      setPrepareState(PREPARE_STATE.READY)
      setPrepareMessage(PREPARE_TEST_SUCCESS_MESSAGE)
      showSuccess(PREPARE_TEST_SUCCESS_MESSAGE)
    } catch (err) {
      setPrepareState(PREPARE_STATE.ERROR)
      setPrepareMessage(err.message || 'Не удалось подготовить устройство к тесту')
      showWarning(err.message || 'Не удалось подготовить устройство к тесту')
    }
  }

  async function handlePreflightServer() {
    if (preflightState === PREFLIGHT_STATE.CHECKING || busy || !testReady) return
    setPreflightState(PREFLIGHT_STATE.CHECKING)
    setPreflightMessage('')
    setPreflightSummary('')
    try {
      const result = await preflightServerTestWebPush()
      setPreflightState(PREFLIGHT_STATE.SUCCESS)
      setPreflightMessage(result.message)
      setPreflightSummary(result.summary)
      showSuccess(result.message)
    } catch (err) {
      setPreflightState(PREFLIGHT_STATE.ERROR)
      setPreflightMessage(err.message || 'Не удалось проверить готовность сервера')
      showWarning(err.message || 'Не удалось проверить готовность сервера')
    }
  }

  async function handleIssuePermit() {
    if (
      permitState === PERMIT_STATE.ISSUING ||
      busy ||
      !testReady ||
      preflightState !== PREFLIGHT_STATE.SUCCESS
    ) {
      return
    }

    setPermitState(PERMIT_STATE.ISSUING)
    setPermitMessage('')
    try {
      const result = await issueServerTestSendPermit()
      setPermitState(PERMIT_STATE.ACTIVE)
      setPermitValid(true)
      setPermitMessage(result.message)
      setPermitExpiryLabel(result.expiryLabel)
      setPermitCountdownSeconds(getTestSendPermitCountdownSeconds())
      showSuccess(result.message)
    } catch (err) {
      setPermitState(PERMIT_STATE.ERROR)
      setPermitValid(false)
      setPermitMessage(err.message || PERMIT_ISSUE_SUCCESS_MESSAGE)
      showWarning(err.message || 'Не удалось создать одноразовое разрешение')
    }
  }

  async function handleServerTest() {
    if (
      serverSendState === SERVER_SEND_STATE.SENDING ||
      serverSendState === SERVER_SEND_STATE.BLOCKED ||
      hasAttemptedSendTestRequest()
    ) {
      return
    }

    setServerSendState(SERVER_SEND_STATE.SENDING)
    setServerSendMessage('')
    try {
      await sendServerTestWebPush()
      setServerSendState(SERVER_SEND_STATE.SUCCESS)
      setPermitState(PERMIT_STATE.USED)
      setPermitValid(false)
      setServerSendMessage('Серверное push-уведомление отправлено')
      showSuccess('Серверное push-уведомление отправлено')
    } catch (err) {
      const message = err.message || 'Не удалось отправить push-уведомление'
      setServerSendState(SERVER_SEND_STATE.BLOCKED)
      setPermitState(PERMIT_STATE.USED)
      setPermitValid(false)
      setServerSendMessage(message)
      showWarning(message)

      if (
        message.includes('не зарегистрировано') ||
        message.includes('устарела')
      ) {
        await refreshStatus()
      }
    }
  }

  return (
    <section className="push-settings profile-page__card">
      <h2 className="push-settings__title">Уведомления на этом устройстве</h2>
      <p className="push-settings__description">
        Получайте напоминания о смене и важных событиях, даже когда платформа закрыта.
      </p>

      {uiState === UI_STATE.LOADING && (
        <p className="push-settings__status" role="status">
          Проверяем состояние…
        </p>
      )}

      {uiState === UI_STATE.UNSUPPORTED && (
        <p className="push-settings__status">
          Этот браузер не поддерживает системные уведомления.
        </p>
      )}

      {uiState === UI_STATE.OFFLINE_MODE && (
        <p className="push-settings__status">
          Web Push доступен только в облачном режиме с Supabase Auth.
        </p>
      )}

      {uiState === UI_STATE.DENIED && (
        <p className="push-settings__status push-settings__status--warning">
          {WEB_PUSH_ERROR_MESSAGES.permission_denied}
        </p>
      )}

      {(uiState === UI_STATE.DEFAULT || uiState === UI_STATE.DISABLED) && (
        <div className="push-settings__actions">
          {uiState === UI_STATE.DISABLED && (
            <p className="push-settings__status">Уведомления отключены</p>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleEnable}
            disabled={busy}
          >
            {uiState === UI_STATE.DISABLED ? 'Включить снова' : 'Включить уведомления'}
          </button>
        </div>
      )}

      {uiState === UI_STATE.ENABLING && (
        <button type="button" className="btn btn--primary btn--sm" disabled>
          Подключаем…
        </button>
      )}

      {uiState === UI_STATE.ENABLED && (
        <div className="push-settings__actions">
          <p className="push-settings__status push-settings__status--success">
            Уведомления включены
          </p>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={handleDisable}
            disabled={busy}
          >
            Отключить
          </button>
          {import.meta.env.DEV && (
            <div className="push-settings__dev-tests">
              <p className="push-settings__hint">
                Локальное уведомление проверяет браузер. Серверное push проверяет полный путь от Edge Function до устройства.
              </p>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleDevTest}
              >
                Показать локальное уведомление
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleServerTest}
                disabled={serverSendState === SERVER_SEND_STATE.SENDING || busy}
              >
                {serverSendState === SERVER_SEND_STATE.SENDING
                  ? 'Отправляем…'
                  : 'Отправить серверное push'}
              </button>
              {serverSendMessage && (
                <p
                  className={`push-settings__status ${
                    serverSendState === SERVER_SEND_STATE.SUCCESS
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="alert"
                  aria-live="assertive"
                >
                  {serverSendMessage}
                </p>
              )}
            </div>
          )}
          {isProductionE2eTestSendEnabled() && !import.meta.env.DEV && (
            <div className="push-settings__dev-tests">
              <p className="push-settings__hint">
                Сначала синхронизируйте это устройство, затем отправьте одно контролируемое тестовое уведомление.
              </p>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handlePrepareTest}
                disabled={
                  prepareState === PREPARE_STATE.PREPARING ||
                  busy ||
                  serverSendState === SERVER_SEND_STATE.SENDING ||
                  serverSendState === SERVER_SEND_STATE.SUCCESS ||
                  serverSendState === SERVER_SEND_STATE.BLOCKED
                }
              >
                {prepareState === PREPARE_STATE.PREPARING
                  ? 'Подготавливаем…'
                  : 'Подготовить устройство к тесту'}
              </button>
              {prepareMessage && (
                <p
                  className={`push-settings__status ${
                    prepareState === PREPARE_STATE.READY
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="status"
                >
                  {prepareMessage}
                </p>
              )}
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handlePreflightServer}
                disabled={
                  !testReady ||
                  preflightState === PREFLIGHT_STATE.CHECKING ||
                  busy
                }
              >
                {preflightState === PREFLIGHT_STATE.CHECKING
                  ? 'Проверяем…'
                  : 'Проверить готовность сервера'}
              </button>
              {preflightMessage && (
                <p
                  className={`push-settings__status ${
                    preflightState === PREFLIGHT_STATE.SUCCESS
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="status"
                >
                  {preflightMessage}
                </p>
              )}
              {preflightSummary && (
                <pre className="push-settings__hint push-settings__preflight-summary">{preflightSummary}</pre>
              )}
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleIssuePermit}
                disabled={
                  !testReady ||
                  preflightState !== PREFLIGHT_STATE.SUCCESS ||
                  permitState === PERMIT_STATE.ISSUING ||
                  permitState === PERMIT_STATE.ACTIVE ||
                  permitState === PERMIT_STATE.USED ||
                  busy
                }
              >
                {permitState === PERMIT_STATE.ISSUING
                  ? 'Создаём…'
                  : 'Создать одноразовое разрешение'}
              </button>
              {permitMessage && (
                <p
                  className={`push-settings__status ${
                    permitState === PERMIT_STATE.ACTIVE
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="status"
                >
                  {permitMessage}
                </p>
              )}
              {permitState === PERMIT_STATE.ACTIVE && permitExpiryLabel && (
                <p className="push-settings__hint" role="status">
                  Разрешение активно до {permitExpiryLabel}
                  {permitCountdownSeconds > 0 ? ` (осталось ${permitCountdownSeconds} с)` : ''}
                </p>
              )}
              {permitState === PERMIT_STATE.EXPIRED && (
                <p className="push-settings__status push-settings__status--warning" role="status">
                  Срок одноразового разрешения истёк
                </p>
              )}
              {permitState === PERMIT_STATE.USED && (
                <p className="push-settings__status push-settings__status--warning" role="status">
                  Одноразовое разрешение уже использовано
                </p>
              )}
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleServerTest}
                disabled={
                  !testReady ||
                  preflightState !== PREFLIGHT_STATE.SUCCESS ||
                  !permitValid ||
                  permitState === PERMIT_STATE.USED ||
                  permitState === PERMIT_STATE.EXPIRED ||
                  serverSendState === SERVER_SEND_STATE.SENDING ||
                  serverSendState === SERVER_SEND_STATE.SUCCESS ||
                  serverSendState === SERVER_SEND_STATE.BLOCKED ||
                  hasAttemptedSendTestRequest() ||
                  busy
                }
              >
                {serverSendState === SERVER_SEND_STATE.SENDING
                  ? 'Отправляем…'
                  : 'Отправить тестовое уведомление'}
              </button>
              {serverSendMessage && (
                <p
                  className={`push-settings__status ${
                    serverSendState === SERVER_SEND_STATE.SUCCESS
                      ? 'push-settings__status--success'
                      : 'push-settings__status--warning'
                  }`}
                  role="alert"
                  aria-live="assertive"
                >
                  {serverSendMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {uiState === UI_STATE.DISABLING && (
        <button type="button" className="btn btn--outline btn--sm" disabled>
          Отключаем…
        </button>
      )}

      {uiState === UI_STATE.ERROR && (
        <div className="push-settings__actions">
          <p className="push-settings__status push-settings__status--warning">
            {errorMessage || 'Не удалось подключить уведомления'}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleEnable}
            disabled={busy}
          >
            Повторить
          </button>
        </div>
      )}
    </section>
  )
}
