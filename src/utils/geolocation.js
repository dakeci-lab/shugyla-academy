/** Браузерная геолокация для тайм-трекера */

const MIN_ACCURACY_METERS = 150

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
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
