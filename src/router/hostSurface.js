import { getAppUrl } from './basename'

export const HOST_SURFACE = {
  CORPORATE: 'corporate',
  PLATFORM: 'platform',
  CAREERS: 'careers',
  COMBINED: 'combined',
}

export const CORPORATE_ORIGIN = 'https://shugyla-market.kz'
export const PLATFORM_ORIGIN = 'https://web.shugyla-market.kz'
export const DEFAULT_CAREERS_ORIGIN = 'https://jobs.shugyla-market.kz'

function currentLocation() {
  if (typeof window === 'undefined') return null
  return window.location
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '')
}

export function isLocalOrLegacyHost(hostname = currentLocation()?.hostname) {
  const host = normalizeHostname(hostname)
  return (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host === 'dakeci-lab.github.io'
  )
}

export function getHostSurface(hostname = currentLocation()?.hostname) {
  const host = normalizeHostname(hostname)
  if (host === 'shugyla-market.kz' || host === 'www.shugyla-market.kz') {
    return HOST_SURFACE.CORPORATE
  }
  if (host === 'web.shugyla-market.kz') return HOST_SURFACE.PLATFORM
  if (host === 'jobs.shugyla-market.kz') return HOST_SURFACE.CAREERS
  return HOST_SURFACE.COMBINED
}

function configuredCareersOrigin() {
  const raw = String(import.meta.env.VITE_CAREERS_ORIGIN || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
}

export function getCareersOrigin(location = currentLocation()) {
  const configured = configuredCareersOrigin()
  if (configured) return configured

  const hostname = location?.hostname
  if (
    isLocalOrLegacyHost(hostname) ||
    getHostSurface(hostname) === HOST_SURFACE.COMBINED
  ) {
    return location?.origin || 'http://localhost'
  }
  return DEFAULT_CAREERS_ORIGIN
}

function querySuffix(search = '') {
  const raw = String(search || '').trim()
  if (!raw) return ''
  return raw.startsWith('?') ? raw : `?${raw.replace(/^\?+/, '')}`
}

function isCombinedCareersLocation(location = currentLocation()) {
  return getHostSurface(location?.hostname) === HOST_SURFACE.COMBINED
}

export function getCareersHomePath(location = currentLocation()) {
  return isCombinedCareersLocation(location) ? '/apply' : '/'
}

export function getCareersUrl(relativePath = '', search = '', location = currentLocation()) {
  const normalized = String(relativePath || '').replace(/^\/+|\/+$/g, '')
  const origin = getCareersOrigin(location)

  if (isCombinedCareersLocation(location) && origin === location?.origin) {
    const localPath = normalized || 'apply'
    return `${getAppUrl(localPath, origin)}${querySuffix(search)}`
  }

  const url = new URL(normalized ? `/${normalized}` : '/', origin)
  url.search = querySuffix(search)
  return url.toString()
}

export function getPlatformUrl(relativePath = '', search = '') {
  const normalized = String(relativePath || '').replace(/^\/+/, '')
  const url = new URL(normalized ? `/${normalized}` : '/', PLATFORM_ORIGIN)
  url.search = querySuffix(search)
  return url.toString()
}
