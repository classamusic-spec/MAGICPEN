import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import './hud.css'
import App from './App.tsx'
import { installPaper } from '@/lib/ink'
import { registerServiceWorker } from '@/lib/pwa'
import { initNative } from '@/lib/native'

installPaper()
// makes the app work with no network at all — see lib/pwa
registerServiceWorker()
// wires the iOS/Android shell (back button, splash, status bar); no-op on web
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
