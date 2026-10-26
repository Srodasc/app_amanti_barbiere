'use client';

import { ReactNode, useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Botones fijos abajo: siempre visibles aunque el contenido se desplace */
  footer?: ReactNode;
}

/**
 * Ventana modal. En celular sale desde abajo y ocupa el ancho; en pantallas
 * grandes, centrada. Nunca supera el alto de la pantalla: el contenido se
 * desplaza por dentro y el título y los botones (footer) quedan fijos.
 */
export default function Modal({ isOpen, onClose, children, title, size = 'md', footer }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-inverse/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative w-full flex flex-col bg-surface shadow-modal glass animate-slide-up',
          'max-h-[92dvh] rounded-t-2xl sm:rounded-lg sm:max-h-[calc(100dvh-2rem)]',
          sizes[size]
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-container-low shrink-0">
            <h2 id={titleId} className="text-lg font-semibold text-inverse">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 -mr-2 text-inverse/60 hover:text-inverse transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-4 overflow-y-auto overscroll-contain min-h-0 flex-1">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-surface-container-low px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface rounded-b-lg">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
