import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { CloseIcon } from './icons/PlatformIcons'
import './CandidatePhotoPreviewModal.css'

/** Полноэкранный просмотр фотографии кандидата (portal → document.body) */
export default function CandidatePhotoPreviewModal({
  photoUrl,
  alt = 'Фотография кандидата',
  onClose,
  triggerRef,
}) {
  const closeButtonRef = useRef(null)
  const [loadState, setLoadState] = useState('loading')

  useBodyScrollLock(Boolean(photoUrl))

  useEffect(() => {
    if (!photoUrl) return undefined
    setLoadState('loading')
  }, [photoUrl])

  useEffect(() => {
    if (!photoUrl) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(timer)
      triggerRef?.current?.focus()
    }
  }, [photoUrl, onClose, triggerRef])

  if (!photoUrl) return null

  return createPortal(
    <div
      className="photo-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="photo-preview-close"
        onClick={onClose}
        aria-label="Закрыть просмотр"
      >
        <CloseIcon size={20} />
      </button>

      <div
        className="photo-preview-modal"
        onClick={(event) => event.stopPropagation()}
      >
        {loadState === 'loading' && (
          <div className="photo-preview-loader" aria-hidden="true">
            <span className="photo-preview-spinner" />
          </div>
        )}

        {loadState === 'error' && (
          <div className="photo-preview-error">
            <svg
              className="photo-preview-error__icon"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <p className="photo-preview-error__text">Не удалось загрузить фотографию</p>
            <button type="button" className="btn btn--outline photo-preview-error__btn" onClick={onClose}>
              Закрыть
            </button>
          </div>
        )}

        <img
          src={photoUrl}
          alt={alt}
          className={`candidate-photo-preview ${loadState === 'loaded' ? 'candidate-photo-preview--visible' : ''}`}
          onLoad={() => setLoadState('loaded')}
          onError={() => setLoadState('error')}
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>,
    document.body
  )
}
