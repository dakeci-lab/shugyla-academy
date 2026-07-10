import { useState } from 'react'
import {
  getEmployeeInitials,
  resolveAvatarUrl,
  resolveEmployeeDisplayName,
} from '../utils/avatarUtils'
import './EmployeeAvatar.css'

/** Универсальный аватар сотрудника — фото или инициалы */
export default function EmployeeAvatar({
  firstName,
  lastName,
  name,
  fullName,
  imageUrl,
  avatarUrl,
  photoUrl,
  size = 'md',
  className = '',
  alt,
  asButton = false,
  onClick,
  ...rest
}) {
  const displayName = resolveEmployeeDisplayName({ firstName, lastName, name, fullName })
  const src = resolveAvatarUrl({ imageUrl, avatarUrl, photoUrl })
  const initials = getEmployeeInitials({ firstName, lastName, name, fullName })
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = Boolean(src && !imageFailed)
  const isInteractive = asButton || onClick
  const classes = [
    'employee-avatar',
    `employee-avatar--${size}`,
    !showImage ? 'employee-avatar--placeholder' : '',
    isInteractive ? 'employee-avatar--clickable employee-avatar--button' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = showImage ? (
    <img
      src={src}
      alt=""
      className="employee-avatar__image"
      onError={() => setImageFailed(true)}
      draggable={false}
    />
  ) : (
    initials
  )

  if (isInteractive) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        aria-label={alt || displayName}
        {...rest}
      >
        {content}
      </button>
    )
  }

  return (
    <span
      className={classes}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      {...rest}
    >
      {content}
    </span>
  )
}
