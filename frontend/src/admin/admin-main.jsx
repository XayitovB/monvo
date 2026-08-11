import { StrictMode } from 'react'
import 'bootstrap-icons/font/bootstrap-icons.css'
import { createRoot } from 'react-dom/client'
import AdminApp from './AdminApp'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
)
