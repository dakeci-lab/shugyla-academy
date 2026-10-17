import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, cpSync, writeFileSync } from 'fs'
import { resolve } from 'path'

function normalizeBasePath(value) {
  const raw = String(value || '').trim()
  if (!raw) return '/'

  let normalized = raw.startsWith('/') ? raw : `/${raw}`
  normalized = normalized.replace(/\/{2,}/g, '/')
  if (!normalized.endsWith('/')) normalized = `${normalized}/`

  return normalized
}

export default defineConfig(({ command }) => {
  // GitHub Pages remains the safe fallback. The PS.kz build passes APP_BASE_PATH=/.
  const defaultBasePath = command === 'serve' ? '/' : '/shugyla-academy/'
  const base = normalizeBasePath(process.env.APP_BASE_PATH || defaultBasePath)

  return {
    base,
    build: {
      rollupOptions: {
        output: {
          // Third-party libraries change rarely, platform code on every release. Separate files let a
          // browser keep the cached vendor chunks (assets are served with a 10-year cache) and re-download
          // only the changed app chunk. Excel/PDF libraries stay dynamic-import only.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
            if (/node_modules\/react-router/.test(id)) return 'vendor-router'
            if (/node_modules\/(@supabase|iceberg-js|tslib)\//.test(id)) return 'vendor-supabase'
            return undefined
          },
        },
      },
    },
    plugins: [
      react(),
      {
        name: 'static-spa-output',
        closeBundle() {
          const dist = resolve(__dirname, 'dist')
          // `/icons/` is reserved by Apache on some Plesk hosts. Publish the
          // PWA assets under a neutral path while keeping the legacy copy for
          // the GitHub Pages fallback and already-installed clients.
          cpSync(resolve(dist, 'icons'), resolve(dist, 'pwa-icons'), { recursive: true })
          copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
          writeFileSync(resolve(dist, '.nojekyll'), '')
          writeFileSync(
            resolve(dist, 'version.json'),
            `${JSON.stringify({
              commit: process.env.GITHUB_SHA || 'local',
              base,
            }, null, 2)}\n`
          )
        },
      },
    ],
  }
})
