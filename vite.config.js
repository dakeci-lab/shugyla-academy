import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  // Базовый путь для GitHub Pages: https://dakeci-lab.github.io/shugyla-academy/
  base: '/shugyla-academy/',
  plugins: [
    react(),
    // GitHub Pages: 404.html и .nojekyll для SPA-маршрутизации
    {
      name: 'gh-pages',
      closeBundle() {
        const dist = resolve(__dirname, 'dist')
        copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
        writeFileSync(resolve(dist, '.nojekyll'), '')
      },
    },
  ],
})
