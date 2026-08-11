import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

fetch('/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: location.pathname }),
}).catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
