import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Primeira webfont que o projeto carrega de verdade: antes disso o app
// declarava Inter sem nunca importá-la e caía no sans-serif do sistema.
import '@fontsource-variable/geist'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
