/**
 * Brand photo slot for public careers surfaces (hero / about / vacancy / apply).
 * Replaces pattern placeholders when a real asset is available.
 */
export default function CareersPhoto({ src, alt, className = '', objectPosition = 'center' }) {
  return (
    <div className={`careers-photo ${className}`.trim()}>
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
