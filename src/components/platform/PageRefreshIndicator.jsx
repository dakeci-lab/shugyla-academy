import './PageRefreshIndicator.css'

/**
 * Компактный индикатор обновления под Header (Umag-style).
 * Не fullscreen, не затемняет контент.
 */
export default function PageRefreshIndicator({
  visible = false,
  refreshing = false,
  dragging = false,
  hiding = false,
  height = 0,
  pullProgress = 0,
  pullRotation = 0,
  label = 'Обновление',
}) {
  const className = [
    'page-refresh-indicator',
    visible ? 'page-refresh-indicator--visible' : '',
    dragging ? 'page-refresh-indicator--dragging' : '',
    refreshing ? 'page-refresh-indicator--refreshing' : '',
    hiding ? 'page-refresh-indicator--hiding' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      aria-hidden={!visible}
      style={{ height: visible ? height : 0 }}
    >
      <div
        className="page-refresh-indicator__inner"
        style={{
          '--refresh-opacity': refreshing || hiding ? 1 : pullProgress,
        }}
      >
        <span
          className={`page-refresh-indicator__spinner${
            refreshing ? ' page-refresh-indicator__spinner--loading' : ''
          }`}
          style={refreshing ? undefined : { '--refresh-rotation': pullRotation }}
          aria-hidden="true"
        />
        {refreshing && (
          <span className="page-refresh-indicator__label" role="status" aria-live="polite">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
