import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTimeRange, formatTimeValue, SHIFT_RESULT_CODE, SHIFT_STATUS_LABELS } from '../../../utils/shiftData'
import { formatDurationMinutes } from '../../../utils/attendanceData'
import './TimeTrackerHome.css'

function formatHomeDateLabel() {
  const now = new Date()
  const date = now.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long' })
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${date} • ${weekdayCap}`
}

function formatClockTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatElapsedMinutes(actualStartIso, now) {
  if (!actualStartIso) return null
  const start = new Date(actualStartIso)
  if (Number.isNaN(start.getTime())) return null
  const minutes = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000))
  return formatDurationMinutes(minutes)
}

/** Только визуальное состояние карточки — логика кнопок передаётся снаружи */
export function resolveHomeCardVariant({
  state,
  computedStatus,
  shift,
  canCheckIn,
  canCheckOut,
  isWorkingShift,
}) {
  if (state.code === 'completed') return 'completed'
  if (
    state.code === 'missed' ||
    computedStatus?.code === SHIFT_RESULT_CODE.ABSENCE ||
    shift?.status === 'absence'
  ) {
    if (canCheckIn || canCheckOut) {
      // Ложное «отсутствие» до конца смены — показываем ожидание
      if (canCheckIn) return 'waiting'
      if (canCheckOut) {
        return computedStatus?.code === SHIFT_RESULT_CODE.LATE ? 'late' : 'working'
      }
    }
    return 'absence'
  }
  if (canCheckOut) {
    if (computedStatus?.code === SHIFT_RESULT_CODE.LATE) return 'late'
    return 'working'
  }
  if (canCheckIn) return 'waiting'
  if (!shift) return 'empty'
  if (!isWorkingShift) return 'dayoff'
  return 'idle'
}

function InfoRow({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="tt-home-info-row">
      <span className="tt-home-info-row__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="tt-home-info-row__body">
        <span className="tt-home-info-row__label">{label}</span>
        <span className="tt-home-info-row__value">{value}</span>
      </div>
    </div>
  )
}

function StatusIcon({ variant }) {
  const icons = {
    waiting: '🟢',
    working: '🟢',
    late: '🟠',
    completed: '✅',
    absence: '🔴',
    empty: '📅',
    dayoff: '🏖️',
    idle: 'ℹ️',
  }
  return (
    <div className={`tt-home-status-icon tt-home-status-icon--${variant}`} aria-hidden="true">
      <span className="tt-home-status-icon__emoji">{icons[variant] || 'ℹ️'}</span>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="tt-home-card tt-home-card--skeleton" aria-hidden="true">
      <div className="tt-home-skeleton tt-home-skeleton--icon" />
      <div className="tt-home-skeleton tt-home-skeleton--title" />
      <div className="tt-home-skeleton tt-home-skeleton--line" />
      <div className="tt-home-skeleton tt-home-skeleton--line tt-home-skeleton--short" />
      <div className="tt-home-skeleton tt-home-skeleton--btn" />
    </div>
  )
}

export default function TimeTrackerHomeCard({
  welcomeName,
  showWelcome = true,
  sectionTitle = 'Сегодняшняя смена',
  shift,
  state,
  computedStatus,
  displayStatus,
  canCheckIn,
  canCheckOut,
  acting,
  loading,
  loadError,
  onCheckIn,
  onCheckOut,
  onRetry,
  now,
  isWorkingShift,
  actionError,
  success,
  previousShiftMissedClockOut = false,
}) {
  const variant = useMemo(
    () =>
      resolveHomeCardVariant({
        state,
        computedStatus,
        shift,
        canCheckIn,
        canCheckOut,
        isWorkingShift,
      }),
    [state, computedStatus, shift, canCheckIn, canCheckOut, isWorkingShift]
  )

  const prevVariant = useRef(variant)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (prevVariant.current !== variant) {
      setAnimating(true)
      prevVariant.current = variant
      const timer = setTimeout(() => setAnimating(false), 420)
      return () => clearTimeout(timer)
    }
  }, [variant])

  const plannedRange =
    shift && isWorkingShift
      ? formatTimeRange(shift.plannedStartTime, shift.plannedEndTime) || '—'
      : null

  const statusTitle = useMemo(() => {
    if (variant === 'waiting') {
      return displayStatus === 'Смена ещё не начата'
        ? 'Смена ещё не началась'
        : 'Ожидается начало смены'
    }
    if (variant === 'working') return 'Вы на работе'
    if (variant === 'late') return 'Вы опоздали'
    if (variant === 'completed') return 'Смена завершена'
    if (variant === 'absence') return 'Отсутствие'
    if (variant === 'empty') return 'График не установлен'
    if (variant === 'dayoff') return SHIFT_STATUS_LABELS[shift?.status] || 'Выходной'
    return displayStatus || 'Статус смены'
  }, [variant, displayStatus, shift?.status])

  const statusHint = useMemo(() => {
    if (variant === 'absence') return 'Приход не был отмечен. Плановая смена завершилась.'
    if (variant === 'empty') return 'На сегодня смена не назначена.'
    return null
  }, [variant])

  const workedMinutes = computedStatus?.workedMinutes ?? shift?.workedMinutes ?? 0
  const elapsed = formatElapsedMinutes(shift?.actualStartTime, now)
  const lateMinutes = computedStatus?.lateMinutes ?? 0

  return (
    <section className="tt-home">
      {showWelcome && (
        <header className="tt-home-header">
          <h2 className="tt-home-header__welcome">Добро пожаловать, {welcomeName}</h2>
          <p className="tt-home-header__section">{sectionTitle}</p>
          <p className="tt-home-header__date">{formatHomeDateLabel()}</p>
        </header>
      )}

      {previousShiftMissedClockOut && !loading && !loadError && (
        <p className="tt-home-missed-checkout-hint" role="status">
          Во время прошлой смены уход не был отмечен
        </p>
      )}

      {loading ? (
        <HomeSkeleton />
      ) : loadError ? (
        <div className="tt-home-card tt-home-card--error">
          <StatusIcon variant="idle" />
          <h3 className="tt-home-card__status">Не удалось загрузить смену</h3>
          <p className="tt-home-card__hint">Проверьте подключение и попробуйте снова</p>
          <button type="button" className="tt-home-btn tt-home-btn--secondary" onClick={onRetry}>
            Повторить
          </button>
        </div>
      ) : (
        <div
          className={`tt-home-card tt-home-card--${variant}${animating ? ' tt-home-card--animate' : ''}`}
          key={variant}
        >
          <StatusIcon variant={variant} />
          <h3 className="tt-home-card__status">{statusTitle}</h3>
          {statusHint && <p className="tt-home-card__hint">{statusHint}</p>}

          <div className="tt-home-info">
            {variant === 'late' && (
              <>
                <InfoRow icon="🕒" label="План" value={formatTimeValue(shift?.plannedStartTime)} />
                <InfoRow icon="📍" label="Факт" value={formatClockTime(shift?.actualStartTime)} />
                <InfoRow
                  icon="⏱"
                  label="Опоздание"
                  value={lateMinutes > 0 ? `${lateMinutes} минут` : null}
                />
              </>
            )}

            {(variant === 'waiting' || variant === 'absence' || variant === 'dayoff') && (
              <InfoRow icon="🕒" label="Плановая смена" value={plannedRange} />
            )}

            {(variant === 'working' || variant === 'late') && (
              <>
                <InfoRow icon="📍" label="Приход" value={formatClockTime(shift?.actualStartTime)} />
                <InfoRow icon="⏱" label="Прошло" value={elapsed} />
              </>
            )}

            {variant === 'completed' && (
              <>
                <InfoRow icon="📍" label="Приход" value={formatClockTime(shift?.actualStartTime)} />
                <InfoRow icon="🚪" label="Уход" value={formatClockTime(shift?.actualEndTime)} />
                <InfoRow
                  icon="⏱"
                  label="Отработано"
                  value={workedMinutes > 0 ? formatDurationMinutes(workedMinutes) : elapsed}
                />
              </>
            )}

            {variant === 'empty' && !plannedRange && (
              <InfoRow icon="🕒" label="Плановая смена" value="—" />
            )}
          </div>

          {canCheckIn && (
            <div className="tt-home-actions">
              <button
                type="button"
                className="tt-home-btn tt-home-btn--start"
                disabled={acting}
                onClick={onCheckIn}
              >
                <span className="tt-home-btn__icon" aria-hidden="true">
                  ▶
                </span>
                {acting ? 'Проверка…' : 'Начать смену'}
              </button>
              <p className="tt-home-actions__hint">Отметить приход</p>
            </div>
          )}

          {canCheckOut && (
            <div className="tt-home-actions">
              <button
                type="button"
                className={`tt-home-btn tt-home-btn--end${variant === 'late' ? ' tt-home-btn--end-late' : ''}`}
                disabled={acting}
                onClick={onCheckOut}
              >
                <span className="tt-home-btn__icon" aria-hidden="true">
                  ⏹
                </span>
                {acting ? 'Проверка…' : 'Завершить смену'}
              </button>
              <p className="tt-home-actions__hint">Отметить уход</p>
            </div>
          )}

          {variant === 'completed' && (
            <div className="tt-home-banner tt-home-banner--success">
              <span aria-hidden="true">✔</span> До встречи завтра!
            </div>
          )}
        </div>
      )}

      {success && !loadError && (
        <p className="tt-home-toast tt-home-toast--success" role="status">
          {success}
        </p>
      )}
      {actionError && (
        <p className="tt-home-toast tt-home-toast--error" role="alert">
          {actionError}
        </p>
      )}
    </section>
  )
}
