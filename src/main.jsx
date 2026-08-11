import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { installPwaZoomGuard } from './pwa/pwaZoomGuard'
import { setupShellLoadRecovery } from './pwa/pwaRecovery'
import { setupPwaStandaloneDocument } from './utils/pwaStandalone'
import { getHostSurface, HOST_SURFACE } from './router/hostSurface'
import './index.css'
import './styles/mobile.css'

const hostSurface = getHostSurface()
const platformPwaEnabled =
  hostSurface === HOST_SURFACE.PLATFORM || hostSurface === HOST_SURFACE.COMBINED

if (platformPwaEnabled) {
  setupShellLoadRecovery()
  registerServiceWorker()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if (platformPwaEnabled) {
  try {
    setupPwaStandaloneDocument()
  } catch (error) {
    console.warn('Optional PWA standalone setup failed', error)
  }

  try {
    installPwaZoomGuard()
  } catch (error) {
    console.warn('Optional PWA zoom protection failed', error)
  }
}
