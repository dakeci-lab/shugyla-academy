import './IconActionButton.css'

/** Компактная кнопка-иконка с tooltip */
export default function IconActionButton({
  label,
  onClick,
  variant = 'neutral',
  children,
  disabled = false,
}) {
  const variantClass =
    variant === 'danger'
      ? 'icon-action-btn--danger'
      : variant === 'primary'
        ? 'icon-action-btn--primary'
        : ''

  return (
    <button
      type="button"
      className={`icon-action-btn ${variantClass}`}
      onClick={onClick}
      aria-label={label}
      data-tooltip={label}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
