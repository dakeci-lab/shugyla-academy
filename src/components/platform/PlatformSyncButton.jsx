import { PlatformToolbarIconButton } from './PlatformSearchToolbar'
import { RefreshIcon } from '../icons/PlatformIcons'
import './PlatformSyncButton.css'

/**
 * Shared UMAG manual sync control — 44px toolbar icon with spin while busy.
 */
export default function PlatformSyncButton({
  onClick,
  syncing = false,
  disabled = false,
  title,
  'aria-label': ariaLabel,
  className = '',
  ...rest
}) {
  const label = ariaLabel || title || 'Синхронизация UMAG'

  return (
    <PlatformToolbarIconButton
      onClick={onClick}
      disabled={disabled || syncing}
      aria-label={label}
      title={title || label}
      aria-busy={syncing || undefined}
      className={['platform-sync-button', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <span
        className={
          syncing
            ? 'platform-sync-button__icon platform-sync-button__icon--spinning'
            : 'platform-sync-button__icon'
        }
        aria-hidden="true"
      >
        <RefreshIcon size={20} />
      </span>
    </PlatformToolbarIconButton>
  )
}
