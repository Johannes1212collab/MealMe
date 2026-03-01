import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: trigger the self-destructing SW to wipe old caches,
// then deliberately do NOT re-register so users always get fresh code.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // If an old SW exists, register the new self-destructing SW.
      // It will unregister itself and reload the page with fresh JS.
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing) {
        // Register the self-destructing SW which will wipe caches and reload
        await navigator.serviceWorker.register('/sw.js');
      }
      // If no existing SW, we're already clean — no need to register anything
    } catch (err) {
      console.warn('SW operation failed:', err);
    }
  });
}
