'use client';

import { useEffect, useRef } from 'react';

/**
 * Captcha de Cloudflare Turnstile. Casi siempre es invisible: solo muestra una
 * casilla si Cloudflare tiene dudas. Entrega un token de un solo uso (válido 5 min)
 * que el servidor verifica en /api/appointments.
 *
 * Cambia `resetKey` para pedir un token nuevo (por ejemplo después de un intento fallido,
 * porque cada token sirve una sola vez).
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileLoading?: Promise<void>;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileLoading) return window.__turnstileLoading;
  window.__turnstileLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      window.__turnstileLoading = undefined;
      reject(new Error('turnstile_load_failed'));
    };
    document.head.appendChild(s);
  });
  return window.__turnstileLoading;
}

export default function Turnstile({
  siteKey,
  onToken,
  onError,
  resetKey = 0,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onError?: (message: string) => void;
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Guardar los callbacks en refs evita volver a montar el widget en cada render
  const tokenCb = useRef(onToken);
  const errorCb = useRef(onError);
  tokenCb.current = onToken;
  errorCb.current = onError;

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action: 'reservar',
          language: 'es',
          theme: 'light',
          appearance: 'interaction-only',
          callback: (t: string) => tokenCb.current(t),
          'expired-callback': () => tokenCb.current(null),
          'timeout-callback': () => tokenCb.current(null),
          'error-callback': () => {
            tokenCb.current(null);
            errorCb.current?.('No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.');
            return true; // ya lo manejamos nosotros
          },
        });
      })
      .catch(() => errorCb.current?.('No se pudo cargar la verificación. Revisa tu conexión y recarga la página.'));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0 || !widgetId.current || !window.turnstile) return;
    tokenCb.current(null);
    window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  return <div ref={box} className="flex justify-center min-h-0" />;
}
