import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './CandidatePhotoPreviewModal.css'

/** Полноэкранный просмотр фотографии кандидата */
export default function CandidatePhotoPreviewModal({ photoUrl, alt = 'Фотография кандидата', onClose }) {
  useEffect(() => {
    if (!photoUrl) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [photoUrl, onClose])

  if (!photoUrl) return null

  return createPortal(
    <div
      className="photo-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фотографии кандидата"
    >
      <div className="photo-preview-modal" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="photo-preview-close"
          onClick={onClose}
          aria-label="Закрыть просмотр"
        >
          ×
        </button>
        <img
          src={photoUrl}
          alt={alt}
          className="candidate-photo-preview"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>,
    document.body
  )
}
