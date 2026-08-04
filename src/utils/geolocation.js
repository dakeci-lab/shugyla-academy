/** Браузерная геолокация для тайм-трекера */

const MIN_ACCURACY_METERS = 150
const GEO_PERMISSION_TIMEOUT_MS = 15000

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
}

/**
 * Query geolocation permission without prompting.
 * Returns prompt | granted | denied | unsupported | unknown.
 */
export async function queryGeolocationPermission() {
  if (!isGeolocationSupported()) return 'unsupported'
  if (typeof navigator.permissions?.query !== 'function') return 'unknown'

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    const state = result?.state
    if (state === 'granted' || state === 'denied' || state === 'prompt') return state
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Request a one-shot position after an explicit user gesture (no background tracking). */
export async function requestGeolocationPermissionProbe(options = {}) {
  const position = await getCurrentPosition({
    enableHighAccuracy: true,
    timeout: GEO_PERMISSION_TIMEOUT_MS,
    maximumAge: 0,
    ...options,
  })
  return {
    permission: 'granted',
    coords: extractCoords(position),
  }
}

export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error('Геолокация не поддерживается вашим браузером'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(mapGeolocationError(error)),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
        ...options,
      }
    )
  })
}

function mapGeolocationError(error) {
  if (!error) return new Error('Не удалось определить ваше местоположение')
  if (error.code === error.PERMISSION_DENIED) {
    return new Error('Разрешите доступ к геолокации в настройках браузера')
  }
  if (error.code === error.TIMEOUT) {
    return new Error('Не удалось определить ваше местоположение')
  }
  return new Error('Не удалось определить ваше местоположение')
}

export function validatePositionAccuracy(accuracyMeters, maxAccuracy = MIN_ACCURACY_METERS) {
  if (accuracyMeters == null || Number.isNaN(accuracyMeters)) return null
  if (accuracyMeters > maxAccuracy) {
    return 'Слишком низкая точность геолокации. Попробуйте выйти на открытое место'
  }
  return null
}

export function extractCoords(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  }
}
