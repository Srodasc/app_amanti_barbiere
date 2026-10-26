'use client';

import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const HIDE_KEY = 'amanti:ocultar-instalar';

/**
 * "Instala la app": en Android usa el instalador del navegador; en iPhone explica
 * cómo agregarla a la pantalla de inicio. No aparece si ya está instalada.
 */
export default function InstallAppCard() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other' | null>(null);
  const [hidden, setHidden] = useState(true);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      /* sin almacenamiento */
    }
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
    setPlatform(ios ? 'ios' : /android/i.test(ua) ? 'android' : 'other');
    setHidden(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || !platform) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* sin almacenamiento */
    }
  };

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setHidden(true);
      setPrompt(null);
    } else {
      setSteps(true);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-4 border border-primary-200">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Instala la app en tu celular</p>
          <p className="text-sm text-inverse/70">Ábrela desde la pantalla de inicio, como cualquier app, sin buscar el enlace.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="No mostrar más" className="p-1 text-inverse/50 hover:text-inverse">
          <X className="w-4 h-4" />
        </button>
      </div>

      {platform === 'ios' || steps ? (
        <ol className="mt-3 space-y-2 text-sm">
          {platform === 'ios' ? (
            <>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <span>
                  Abre esta página en <strong>Safari</strong>.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <span>
                  Toca <Share className="inline w-4 h-4 -mt-0.5" aria-label="Compartir" /> <strong>Compartir</strong> (abajo o arriba).
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <span>
                  Elige <SquarePlus className="inline w-4 h-4 -mt-0.5" aria-hidden="true" /> <strong>Agregar a inicio</strong> y luego <strong>Agregar</strong>.
                </span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <span>
                  Abre esta página en <strong>Chrome</strong>.
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                Toca el menú <strong>⋮</strong> (arriba a la derecha).
              </li>
              <li className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
                Elige <strong>Instalar app</strong> o <strong>Agregar a pantalla principal</strong>.
              </li>
            </>
          )}
        </ol>
      ) : (
        <button
          type="button"
          onClick={install}
          className="mt-3 w-full h-11 rounded-lg bg-primary text-white font-bold flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> Instalar
        </button>
      )}
    </div>
  );
}
