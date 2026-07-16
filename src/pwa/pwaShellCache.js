/** Must stay in sync with CACHE_NAME prefix in public/sw.js */
export const SHELL_CACHE_PREFIX = 'shugyla-academy-shell-'

export function isShellCacheName(name) {
  return typeof name === 'string' && name.startsWith(SHELL_CACHE_PREFIX)
}

export async function clearShellCaches() {
  if (!('caches' in window)) return []

  const keys = await caches.keys()
  const shellKeys = keys.filter(isShellCacheName)
  await Promise.all(shellKeys.map((key) => caches.delete(key)))
  return shellKeys
}
