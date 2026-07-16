import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { setupPwaZoomGuard } from './pwa/pwaZoomGuard'
import { setupPwaStandaloneDocument } from './utils/pwaStandalone'
import './index.css'
import './styles/mobile.css'

const CHUNK_RELOAD_KEY = 'platform-chunk-reload'

function setupChunkLoadRecovery() {
  window.addEventListener('load', () => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  })

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    window.location.reload()
  })
}

setupChunkLoadRecovery()
registerServiceWorker()
setupPwaStandaloneDocument()
setupPwaZoomGuard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
