import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/reset.css'
import './styles/globals.css'
import App from './App.jsx'
import EventsProvider from './context/EventsProvider'
import { BrowserRouter } from 'react-router-dom'
import AuthProvider from './context/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider><EventsProvider><App /></EventsProvider></AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
