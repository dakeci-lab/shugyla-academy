import { getCandidateInitials } from '../services/candidatePhotoService'
import './CandidateAvatar.css'

/** Аватар кандидата — фото или инициалы */
export default function CandidateAvatar({
  fullName,
  photoUrl,
  size = 'md',
  className = '',
}) {
  const initials = getCandidateInitials(fullName)

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={fullName || 'Фото кандидата'}
        className={`candidate-avatar candidate-avatar--${size} ${className}`}
      />
    )
  }

  return (
    <span
      className={`candidate-avatar candidate-avatar--placeholder candidate-avatar--${size} ${className}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
