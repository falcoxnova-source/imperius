import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// App version - auto-generated from build timestamp (never needs manual update)
declare const __BUILD_TIMESTAMP__: string;
const APP_VERSION = __BUILD_TIMESTAMP__;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Check if stored version differs from current → clear caches
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      // Version changed — clear all caches and reload
      caches.keys().then((names) => {
        Promise.all(names.map((name) => caches.delete(name))).then(() => {
          localStorage.setItem('app_version', APP_VERSION);
          window.location.reload();
        });
      });
      return;
    }
    localStorage.setItem('app_version', APP_VERSION);

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Check for updates every 5 minutes
      setInterval(() => registration.update(), 5 * 60 * 1000);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });
    }).catch(() => {});

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    // Listen for SW_UPDATED message from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        // SW was updated, reload to get fresh content
        window.location.reload();
      }
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
