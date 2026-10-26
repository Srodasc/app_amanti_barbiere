'use client';

import { useEffect } from 'react';

/** Registra el service worker (necesario para instalar la app en Android). */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin service worker la app sigue funcionando en el navegador */
    });
  }, []);
  return null;
}
