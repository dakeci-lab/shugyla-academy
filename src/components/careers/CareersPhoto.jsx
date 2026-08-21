/**
 * Brand photo slot for public careers surfaces (hero / about / vacancy / apply).
 * Use aspect="square" for team/employee shots so media blocks stay compact.
 */
export default function CareersPhoto({
  src,
  alt,
  className = '',
  objectPosition = 'center',
  aspect = 'auto',
}) {
  const aspectClass = aspect === 'square' ? 'careers-photo--square' : ''
  return (
    <div className={`careers-photo ${aspectClass} ${className}`.trim()}>
      <img
        className="careers-photo__img"
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{ objectPosition }}
      />
    </div>
  )
}
