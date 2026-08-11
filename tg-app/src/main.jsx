import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'

const style = document.createElement('style')
style.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes scanline { 0% { top: 4%; } 50% { top: 92%; } 100% { top: 4%; } }
  * { -webkit-tap-highlight-color: transparent; }
  .leaflet-container { background: transparent; font-family: inherit; }
  input { appearance: none; -webkit-appearance: none; }
  ::-webkit-scrollbar { display: none; }
`
document.head.appendChild(style)

createRoot(document.getElementById('root')).render(
  <StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>
)
