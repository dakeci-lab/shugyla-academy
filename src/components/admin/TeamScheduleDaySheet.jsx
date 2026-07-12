import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons/PlatformIcons'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import './TeamScheduleMobile.css'

const SWIPE_CLOSE_THRESHOLD = 72

/** Bottom sheet с подробностями по дню графика */
export default function TeamScheduleDaySheet({ open, detail, onClose }) {
  const closeButtonRef = useRef(null)
  const panelRef = useRef(null)
  const dragRef = useRef({ startY: 0, offsetY: 0, dragging: false })
  const [visible, setVisible] = useState(false)
  const [animatedOpen, setAnimatedOpen] = useState(false)

  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setVisible(true)
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setAnimatedOpen(true))
      })
      return () => window.cancelAnimationFrame(frame)
    }

    setAnimatedOpen(false)
    const timer = window.setTimeout(() => setVisible(false), 280)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handleEscape(event) {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('keydown', handleEscape)
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 50)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      window.clearTimeout(focusTimer)
    }
  }, [open, onClose])

  function resetPanelTransform() {
    const panel = panelRef.current
    if (!panel) return
    panel.style.transform = ''
    panel.style.transition = ''
  }

  function handleTouchStart(event) {
    dragRef.current = {
      startY: event.touches[0].clientY,
      offsetY: 0,
      dragging: true,
    }
    if (panelRef.current) panelRef.current.style.transition = 'none'
  }

  function handleTouchMove(event) {
    if (!dragRef.current.dragging) return
    const delta = Math.max(0, event.touches[0].clientY - dragRef.current.startY)
    dragRef.current.offsetY = delta
    if (panelRef.current) {
      panelRef.current.style.transform = `translateY(${delta}px)`
    }
  }

  function handleTouchEnd() {
    if (!dragRef.current.dragging) return
    const shouldClose = dragRef.current.offsetY >= SWIPE_CLOSE_THRESHOLD
    dragRef.current.dragging = false
    resetPanelTransform()
    if (shouldClose) onClose?.()
  }

  if (!visible || !detail) return null

  return createPortal(
    <>
      <button
        type="button"
        className={`team-schedule-sheet-backdrop${animatedOpen ? ' team-schedule-sheet-backdrop--open' : ''}`}
        onClick={onClose}
        aria-label="Закрыть"
      />

      <div
        ref={panelRef}
        className={`team-schedule-sheet${animatedOpen ? ' team-schedule-sheet--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-schedule-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="team-schedule-sheet__handle-wrap"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="team-schedule-sheet__handle" aria-hidden="true" />
        </div>

        <div className="team-schedule-sheet__header">
          <div className="team-schedule-sheet__heading">
            <h2 id="team-schedule-sheet-title" className="team-schedule-sheet__title">
              {detail.employeeName}
            </h2>
            <p className="team-schedule-sheet__date">{detail.dateLabel}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="team-schedule-sheet__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="team-schedule-sheet__body">
          <dl className="team-schedule-sheet__facts">
            <div className="team-schedule-sheet__fact">
              <dt>План</dt>
              <dd>{detail.planned}</dd>
            </div>
            <div className="team-schedule-sheet__fact">
              <dt>Факт</dt>
              <dd>{detail.actual}</dd>
            </div>
            <div className="team-schedule-sheet__fact">
              <dt>Приход</dt>
              <dd>{detail.actualIn}</dd>
            </div>
            <div className="team-schedule-sheet__fact">
              <dt>Уход</dt>
              <dd>{detail.actualOut}</dd>
            </div>
            <div className="team-schedule-sheet__fact">
              <dt>Статус</dt>
              <dd>{detail.statusLabel}</dd>
            </div>
            {detail.lateMinutes > 0 && (
              <div className="team-schedule-sheet__fact">
                <dt>Опоздание</dt>
                <dd>{detail.lateMinutes} мин</dd>
              </div>
            )}
            {detail.earlyLeaveMinutes > 0 && (
              <div className="team-schedule-sheet__fact">
                <dt>Ранний уход</dt>
                <dd>{detail.earlyLeaveMinutes} мин</dd>
              </div>
            )}
            {detail.isAbsence && (
              <div className="team-schedule-sheet__fact team-schedule-sheet__fact--absence">
                <dt>Отсутствие</dt>
                <dd>Да</dd>
              </div>
            )}
          </dl>

          {detail.comment && (
            <div className="team-schedule-sheet__comment">
              <p className="team-schedule-sheet__comment-label">Комментарий</p>
              <p className="team-schedule-sheet__comment-text">{detail.comment}</p>
            </div>
          )}
        </div>

        <div className="team-schedule-sheet__footer">
          <button type="button" className="btn btn--primary team-schedule-sheet__close-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
