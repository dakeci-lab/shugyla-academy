import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './SaveProgressBar.css'

/**
 * A thin green line under the top menu, like in UMAG: it runs while a change is being saved and fills up when the last
 * one is saved (red if a save failed). Drawn in document.body (the page wrapper has `will-change: transform`).
 * `state` — 'idle' | 'saving' | 'saved' | 'error' (see useSaveTracker).
 */
export default function SaveProgressBar({ state }) {
  const [top, setTop] = useState(0)

  useLayoutEffect(() => {
    if (state === 'idle') return
    const bar = document.querySelector('.platform-layout__topbar')
    setTop(bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0)
  }, [state])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className={`spb spb--${state}`}
      style={{ top }}
      role="progressbar"
      aria-hidden={state === 'idle' ? 'true' : undefined}
      aria-label={state === 'error' ? 'Не удалось сохранить' : state === 'saving' ? 'Сохранение' : 'Сохранено'}
    />,
    document.body
  )
}
