import { getYouTubeEmbedUrl, isYouTubeUrl } from '../utils/video'
import './LessonVideo.css'

/** Видео урока — YouTube iframe или ссылка */
export default function LessonVideo({ videoUrl, title }) {
  if (!videoUrl) {
    return (
      <div className="lesson-video lesson-video--empty">
        Видео для этого урока пока не добавлено.
      </div>
    )
  }

  const embedUrl = getYouTubeEmbedUrl(videoUrl)

  if (embedUrl) {
    return (
      <div className="lesson-video">
        <iframe
          src={embedUrl}
          title={title || 'Видео урока'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="lesson-video__iframe"
        />
      </div>
    )
  }

  return (
    <div className="lesson-video lesson-video--link">
      <a
        href={videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn--primary"
      >
        Открыть видео
      </a>
      {isYouTubeUrl(videoUrl) && (
        <p className="lesson-video__hint">Не удалось встроить видео — откройте по ссылке.</p>
      )}
    </div>
  )
}
