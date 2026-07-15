import { useEffect, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import {
  getTestSendPermitCountdownSeconds,
  hasAttemptedSendTestRequest,
  isPersistedTestSendPermitValid,
  isProductionE2eTestSendEnabled,
  issueServerTestSendPermit,
  PERMIT_ISSUE_SUCCESS_MESSAGE,
  prepareDeviceForTestSend,
  preflightServerTestWebPush,
  PREFLIGHT_SUCCESS_MESSAGE,
  PREPARE_TEST_SUCCESS_MESSAGE,
  readPersistedSendTestDiagnostic,
  readPersistedSendTestRequest,
  readPersistedTestSendPermit,
  sendServerTestWebPush,
  showDevelopmentTestNotification,
} from '../../../services/webPushSubscriptionService'
import './PushNotificationSettings.css'

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

export default function PushNotificationDiagnostics({ busy, onBusyChange, onRefreshStatus }) {
  const { success: showSuccess, warning: showWarning } = useToast()
  const [serverSendState, setServerSendState] = useState(SERVER_SEND_STATE.IDLE)
  const [serverSendMessage, setServerSendMessage] = useState('')
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

  async function handleDevTest() {
    try {
      await showDevelopmentTestNotification()
    } catch (err) {
      showWarning(err.message || 'Не удалось показать локальное уведомление')
    }
  }

  async function handlePrepareTest() {
    if (prepareState === PREPARE_STATE.PREPARING || busy) return
    onBusyChange(true)
    setPrepareState(PREPARE_STATE.PREPARING)
    setPrepareMessage('')
    setTestReady(false)
    try {
      const status = await prepareDeviceForTestSend()
      setTestReady(Boolean(status.testReady))
      setPrepareState(PREPARE_STATE.READY)
      setPrepareMessage(PREPARE_TEST_SUCCESS_MESSAGE)
      showSuccess(PREPARE_TEST_SUCCESS_MESSAGE)
      await onRefreshStatus()
    } catch (err) {
      setPrepareState(PREPARE_STATE.ERROR)
      setPrepareMessage(err.message || 'Не удалось подготовить устройство к тесту')
      showWarning(err.message || 'Не удалось подготовить устройство к тесту')
    } finally {
      onBusyChange(false)
    }
  }

  async function handlePreflightServer() {
    if (preflightState === PREFLIGHT_STATE.CHECKING || busy || !testReady) return
    onBusyChange(true)
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
    } finally {
      onBusyChange(false)
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

    onBusyChange(true)
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
    } finally {
      onBusyChange(false)
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

    onBusyChange(true)
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
      await onRefreshStatus()
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <div className="push-settings__diagnostics">
      <h3 className="push-settings__diagnostics-title">Диагностика уведомлений</h3>
      <p className="push-settings__hint">
        Технические инструменты для администратора. Обычные сотрудники их не видят.
      </p>

      {import.meta.env.DEV && (
        <div className="push-settings__dev-tests">
          <button type="button" className="btn btn--outline btn--sm" onClick={handleDevTest}>
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
        </div>
      )}

      {isProductionE2eTestSendEnabled() && !import.meta.env.DEV && (
        <div className="push-settings__dev-tests">
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
            disabled={!testReady || preflightState === PREFLIGHT_STATE.CHECKING || busy}
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
  )
}
