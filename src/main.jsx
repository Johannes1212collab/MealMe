import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Force the browser to check for a new SW version on every page load.
      // Without this, browsers only check every 24h or when the user navigates.
      registration.update();

      // When a new SW takes over (fires after skipWaiting + clients.claim),
      // automatically reload so users get the fresh code — no hard refresh needed.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  });
}
