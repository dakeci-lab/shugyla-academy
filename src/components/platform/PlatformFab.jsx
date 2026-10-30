import { createPortal } from 'react-dom'
import './PlatformFab.css'

/**
 * Круглая кнопка «+» в правом нижнем углу — главное действие списка на телефоне
 * (на десктопе скрыта: там то же действие стоит в панели над списком).
 * Рисуется в `document.body`: контент страницы лежит в обёртке с `will-change: transform` (pull-to-refresh),
 * а у такой обёртки `position: fixed` потомка считается от неё, не от экрана — кнопка уезжала в конец длинного списка.
 */
export default function PlatformFab({ label, onClick, disabled = false }) {
  return createPortal(
    <button type="button" className="pfab" aria-label={label} disabled={disabled} onClick={onClick}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
    </button>,
    document.body
  )
}
