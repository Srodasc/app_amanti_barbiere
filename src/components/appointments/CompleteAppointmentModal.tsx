'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PAYMENT_LABELS, appointmentErrorMessage, money, time12 } from '@/lib/appointments';

type Target = {
  id: string;
  clientName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  price: number; // precio de la cita (ya con premio, si lo hay)
  barberName: string | null;
  startTime: string;
  hasReward?: boolean;
};
type Extra = { id: string; name: string; price: number };

/**
 * Completar y cobrar: registra el COBRO de la cita (precio + adicionales) con su
 * medio de pago, mediante complete_appointment. No crea ningún gasto.
 */
export default function CompleteAppointmentModal({
  target,
  onClose,
  onDone,
}: {
  target: Target | null;
  onClose: () => void;
  onDone: (total: number) => void;
}) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');
  const [received, setReceived] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setPicked([]);
    setMethod('cash');
    setReceived(null);
    setError('');
    createClient()
      .from('services')
      .select('id, name, price')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setExtras(((data ?? []) as Extra[]).filter((s) => s.id !== target.serviceId)));
  }, [target]);

  const extrasTotal = useMemo(
    () => extras.filter((e) => picked.includes(e.id)).reduce((s, e) => s + Number(e.price), 0),
    [extras, picked]
  );
  const total = (target?.price ?? 0) + extrasTotal;
  const bills = Array.from(new Set([total, 20000, 50000, 100000].filter((v) => v >= total))).slice(0, 4);
  const paidWith = received ?? total;

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    const { data, error } = await createClient().rpc('complete_appointment', {
      p_appointment: target.id,
      p_payment: method,
      p_extras: picked,
    });
    setSaving(false);
    if (error) return setError(appointmentErrorMessage(error));
    onDone(Number(data ?? total));
  };

  const pill = (on: boolean) =>
    cn(
      'min-h-[44px] px-4 rounded-full border text-sm font-semibold transition-colors',
      on ? 'bg-primary text-white border-primary' : 'bg-white text-inverse border-surface-500 hover:border-primary'
    );

  return (
    <Modal isOpen={!!target} onClose={onClose} title="Completar y cobrar" size="md">
      {target && (
        <div className="space-y-5">
          <p className="text-sm text-inverse/70 -mt-2">
            {target.clientName ?? 'Cliente'} · {time12(target.startTime)}
            {target.barberName ? ` con ${target.barberName}` : ''}
          </p>

          <div className="rounded-xl border border-surface-300 bg-surface p-4 space-y-2 text-[15px]">
            <div className="flex justify-between gap-2">
              <span>
                {target.serviceName ?? 'Servicio'}
                {target.hasReward && <span className="ml-2 text-xs font-semibold text-primary">(premio aplicado)</span>}
              </span>
              <strong>{money(target.price)}</strong>
            </div>
            {extras
              .filter((e) => picked.includes(e.id))
              .map((e) => (
                <div key={e.id} className="flex justify-between gap-2 text-primary-700">
                  <span>+ {e.name}</span>
                  <strong>{money(e.price)}</strong>
                </div>
              ))}
            <div className="h-px bg-surface-300 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-bold">{money(total)}</span>
            </div>
          </div>

          {extras.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold">¿Agregó algo más?</p>
              <div className="flex flex-wrap gap-2">
                {extras.map((e) => {
                  const on = picked.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))}
                      className={pill(on)}
                    >
                      {e.name} +{money(e.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-bold">Medio de pago</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Medio de pago">
              {(Object.keys(PAYMENT_LABELS) as (keyof typeof PAYMENT_LABELS)[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={method === k}
                  onClick={() => setMethod(k as typeof method)}
                  className={cn(
                    'h-12 rounded-lg border text-sm font-bold',
                    method === k ? 'bg-primary text-white border-primary' : 'bg-white text-inverse border-surface-500 hover:border-primary'
                  )}
                >
                  {PAYMENT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {method === 'cash' && total > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">Recibe</span>
              {bills.map((b) => (
                <button key={b} type="button" aria-pressed={paidWith === b} onClick={() => setReceived(b)} className={pill(paidWith === b)}>
                  {b === total ? 'Exacto' : money(b)}
                </button>
              ))}
              <span className="ml-auto text-[15px]">
                Cambio: <strong>{money(Math.max(0, paidWith - total))}</strong>
              </span>
            </div>
          )}

          <p className="text-xs text-inverse/60">
            Se registra como <strong className="text-success">ingreso</strong> de la cita (no se crea ningún gasto) y suma la visita de fidelización.
          </p>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="button" onClick={submit} isLoading={saving} className="flex-[2]">
              Registrar cobro · {money(total)}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
