import { createPortal } from 'react-dom'
import { SearchIcon } from '../icons/PlatformIcons'
import './PlatformFloatingSearch.css'

/**
 * Floating search of a phone list (like UMAG): a round-cornered pill with a magnifier that hangs over the bottom
 * edge of the screen. Drawn in document.body: the page wrapper has `will-change: transform`, which would otherwise
 * pin a fixed child to the end of a long list (same reason as PlatformFab).
 * `total` — the sum of the list, pinned under the search at the very bottom of the screen.
 */
export default function PlatformFloatingSearch({ value, onChange, placeholder = 'Поиск', label, total = null }) {
  return createPortal(
    <>
    <div className={`pfs${total ? ' pfs--with-total' : ''}`} role="search">
      <SearchIcon size={22} />
      <input
        type="search"
        className="pfs__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        autoComplete="off"
        enterKeyHint="search"
      />
    </div>
    {total ? (
      <div className="pfs-total">
        <span>Итого</span>
        <strong>{total}</strong>
      </div>
    ) : null}
    </>,
    document.body
  )
}
