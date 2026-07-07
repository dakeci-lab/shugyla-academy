/** Извлечь YouTube video ID из разных форматов ссылок */
export function getYouTubeVideoId(url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1).split('/')[0] || null
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || null
      }
      return parsed.searchParams.get('v')
    }
  } catch {
    return null
  }
  return null
}

export function isYouTubeUrl(url) {
  return Boolean(getYouTubeVideoId(url))
}

export function getYouTubeEmbedUrl(url) {
  const id = getYouTubeVideoId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}
