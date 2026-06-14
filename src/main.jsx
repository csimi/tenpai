import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App.jsx'
import theme from './theme.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// NOTE: intentionally NOT wrapped in <React.StrictMode>. StrictMode double-
// invokes effects in dev (mount → cleanup → mount); our session effect joins a
// Trystero room on mount and leaves on cleanup, so the double-invoke makes each
// tab join → leave → rejoin with the same selfId, which breaks P2P signaling.
createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ThemeProvider>
)

// Register the service worker so the app is installable and launches offline.
// Scoped to Vite's base path so it works on the GitHub Pages project site.
if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {})
  })
}
