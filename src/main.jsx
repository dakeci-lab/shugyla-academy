import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { installPwaZoomGuard } from './pwa/pwaZoomGuard'
import { setupShellLoadRecovery } from './pwa/pwaRecovery'
import { setupPwaStandaloneDocument } from './utils/pwaStandalone'
import './index.css'
import './styles/mobile.css'

setupShellLoadRecovery()
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

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
