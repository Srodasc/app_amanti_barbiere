'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { appointmentErrorMessage, time12 } from '@/lib/appointments';

const REASONS = ['El cliente avisó', 'El barbero no puede', 'Cita duplicada', 'Otro motivo'];

/** Cancelar con confirmación y motivo (cancel_appointment_staff). Avisa al cliente y devuelve su premio si tenía. */
export default function CancelAppointmentModal({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; clientName: string | null; startTime: string; hasReward?: boolean } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const whatsappActive = process.env.NEXT_PUBLIC_WHATSAPP_ACTIVE === 'true';

  useEffect(() => {
    setReason('');
    setDetail('');
    setError('');
  }, [target]);

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    const text = [reason, detail.trim()].filter(Boolean).join(': ');
    const { error } = await createClient().rpc('cancel_appointment_staff', { p_appointment: target.id, p_reason: text || null });
    setSaving(false);
    if (error) return setError(appointmentErrorMessage(error));
    onDone();
  };

  return (
    <Modal isOpen={!!target} onClose={onClose} title="Cancelar cita" size="sm">
      {target && (
        <div className="space-y-4">
          <p className="text-sm">
            ¿Cancelar la cita de <strong>{target.clientName ?? 'el cliente'}</strong> a las {time12(target.startTime)}? El horario quedará libre.
          </p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(reason === r ? '' : r)}
                className={cn(
                  'min-h-[40px] px-3 rounded-full border text-sm font-semibold',
                  reason === r ? 'bg-primary text-white border-primary' : 'bg-white border-surface-500'
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            className="input-field resize-none w-full"
            rows={2}
            maxLength={200}
            placeholder="Detalle (opcional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <ul className="text-xs text-inverse/60 space-y-1">
            {whatsappActive && <li>Se le enviará al cliente un aviso de cancelación por WhatsApp.</li>}
            {target.hasReward && <li>El premio que tenía aplicado vuelve a quedar disponible.</li>}
          </ul>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Volver
            </Button>
            <Button type="button" variant="danger" onClick={submit} isLoading={saving} className="flex-1">
              Cancelar cita
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
