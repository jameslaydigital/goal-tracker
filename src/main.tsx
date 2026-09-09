import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { UpdatePrompt } from './UpdatePrompt'
import { AuthProvider } from './auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
        <UpdatePrompt />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
