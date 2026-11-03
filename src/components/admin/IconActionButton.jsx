import './IconActionButton.css'

/**
 * Компактная кнопка-иконка с tooltip.
 * variant: 'neutral' | 'primary' (зелёная) | 'danger' | 'edit' — ручка «Редактировать / Открыть», синяя, как в UMAG.
 */
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
        : variant === 'edit'
          ? 'icon-action-btn--edit'
          : ''

  return (
    <button
      type="button"
      className={`icon-action-btn ${variantClass}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      data-tooltip={label}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
