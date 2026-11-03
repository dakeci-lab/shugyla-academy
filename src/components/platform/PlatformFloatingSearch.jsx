import { createPortal } from 'react-dom'
import { SearchIcon } from '../icons/PlatformIcons'
import './PlatformFloatingSearch.css'

/**
 * Floating search of a phone list (like UMAG): a round-cornered pill with a magnifier that hangs over the bottom
 * edge of the screen. Drawn in document.body: the page wrapper has `will-change: transform`, which would otherwise
 * pin a fixed child to the end of a long list (same reason as PlatformFab).
 */
export default function PlatformFloatingSearch({ value, onChange, placeholder = 'Поиск', label }) {
  return createPortal(
    <div className="pfs" role="search">
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
    </div>,
    document.body
  )
}
