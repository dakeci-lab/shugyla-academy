import './PageRefreshIndicator.css'

const RADIUS = 15
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Индикатор свайп-обновления: белая круглая «таблетка» с кольцом, которое заполняется по мере натяжения,
 * затем крутилка, по окончании — зелёная галочка. Без видимого текста.
 * Не fullscreen, не затемняет контент.
 */
export default function PageRefreshIndicator({
  visible = false,
  refreshing = false,
  done = false,
  dragging = false,
  hiding = false,
  height = 0,
  pullProgress = 0,
}) {
  const reached = pullProgress >= 1
  const state = done ? 'done' : refreshing ? 'refreshing' : reached ? 'ready' : 'pulling'
  // Без текста: только кольцо, спиннер и в конце галочка. Для скринридеров — скрытая подпись.
  const srLabel = done ? 'Обновлено' : refreshing ? 'Обновляем' : 'Потяните для обновления'

  const className = [
    'page-refresh-indicator',
    visible ? 'page-refresh-indicator--visible' : '',
    dragging ? 'page-refresh-indicator--dragging' : '',
    refreshing || done ? 'page-refresh-indicator--refreshing' : '',
    hiding ? 'page-refresh-indicator--hiding' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} aria-hidden={!visible} style={{ height: visible ? height : 0 }}>
      <div
        className={`page-refresh-indicator__inner page-refresh-indicator__inner--${state}`}
        style={{ '--refresh-opacity': refreshing || done || hiding ? 1 : Math.min(1, pullProgress * 1.4) }}
      >
        <span className="page-refresh-indicator__chip" aria-hidden="true">
          <svg className="page-refresh-indicator__svg" viewBox="0 0 36 36" width="36" height="36">
            <circle className="page-refresh-indicator__track" cx="18" cy="18" r={RADIUS} />
            {state === 'pulling' || state === 'ready' ? (
              <circle
                className="page-refresh-indicator__arc"
                cx="18"
                cy="18"
                r={RADIUS}
                strokeDasharray={`${Math.min(1, pullProgress) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              />
            ) : null}
            {state === 'refreshing' ? (
              <circle
                className="page-refresh-indicator__arc page-refresh-indicator__arc--spin"
                cx="18"
                cy="18"
                r={RADIUS}
                strokeDasharray={`${CIRCUMFERENCE * 0.28} ${CIRCUMFERENCE}`}
              />
            ) : null}
            {state === 'done' ? (
              <path className="page-refresh-indicator__check" d="M11.5 18.5l4.5 4.5 8.5-9.5" />
            ) : null}
            {state === 'pulling' || state === 'ready' ? (
              <path
                className={`page-refresh-indicator__arrow${reached ? ' page-refresh-indicator__arrow--up' : ''}`}
                d="M18 12v11M13.5 18.5L18 23l4.5-4.5"
              />
            ) : null}
          </svg>
        </span>
        <span className="page-refresh-indicator__sr" role="status" aria-live="polite">
          {srLabel}
        </span>
      </div>
    </div>
  )
}
