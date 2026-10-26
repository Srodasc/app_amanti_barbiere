'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui';
import { rewardText } from '@/lib/loyalty';

type Cita = {
  appointment_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  barber_name: string | null;
  service_name: string | null;
  price: number | null;
  can_cancel: boolean;
  business_address: string | null;
  loyalty?: {
    rule_name: string;
    description: string | null;
    visits: number;
    visits_required: number;
    rewards_available: number;
    reward_type: 'free' | 'percent' | 'amount';
    reward_value: number;
    service_name: string | null;
  }[];
};

const ESTADOS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

export default function CitaPage() {
  const { token } = useParams<{ token: string }>();
  const [cita, setCita] = useState<Cita | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/cita/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Cita no encontrada');
        setCita(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const cancelar = async () => {
    if (!confirm('¿Seguro que quieres cancelar tu cita?')) return;
    setBusy(true);
    setError('');
    const r = await fetch(`/api/cita/${token}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok) setError(d.error || 'No se pudo cancelar');
    else setCita((c) => (c ? { ...c, status: 'cancelled', can_cancel: false } : c));
    setBusy(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-heading font-bold text-inverse mb-4">Tu cita</h1>
        {loading && <p className="text-inverse/60">Cargando...</p>}
        {!loading && !cita && <p className="text-error">{error}</p>}
        {cita && (
          <>
            <dl className="space-y-2 text-inverse">
              <div><dt className="text-sm text-inverse/60">Servicio</dt><dd className="font-semibold">{cita.service_name}</dd></div>
              <div><dt className="text-sm text-inverse/60">Barbero</dt><dd className="font-semibold">{cita.barber_name ?? 'Por asignar'}</dd></div>
              <div>
                <dt className="text-sm text-inverse/60">Fecha y hora</dt>
                <dd className="font-semibold capitalize">
                  {format(new Date(`${cita.date}T00:00:00`), "EEEE d 'de' MMMM", { locale: es })} · {cita.start_time.slice(0, 5)}
                </dd>
              </div>
              <div><dt className="text-sm text-inverse/60">Estado</dt><dd className="font-semibold">{ESTADOS[cita.status] ?? cita.status}</dd></div>
              {cita.business_address && (
                <div><dt className="text-sm text-inverse/60">Dirección</dt><dd>{cita.business_address}</dd></div>
              )}
            </dl>
            {cita.loyalty && cita.loyalty.length > 0 && (
              <div className="mt-6 border-t border-inverse/10 pt-4 space-y-3">
                <h2 className="font-semibold text-inverse">Tus premios</h2>
                {cita.loyalty.map((l) => {
                  const pct = Math.min(100, Math.round((l.visits / Math.max(1, l.visits_required)) * 100));
                  const premio = rewardText({
                    reward_type: l.reward_type,
                    reward_value: Number(l.reward_value),
                    service: l.service_name ? { name: l.service_name } : null,
                  });
                  return (
                    <div key={l.rule_name} className="space-y-1">
                      <p className="text-sm font-medium">{l.rule_name}</p>
                      <div className="h-2 rounded-full bg-inverse/10 overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-inverse/60">
                        {l.visits} de {l.visits_required} visitas · premio: {premio}
                        {l.rewards_available > 0 && (
                          <strong className="text-primary">
                            {' '}· ¡Tienes {l.rewards_available} disponible{l.rewards_available > 1 ? 's' : ''}! Pídelo en tu próxima cita.
                          </strong>
                        )}
                      </p>
                      {l.description && <p className="text-xs text-inverse/50">{l.description}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {error && <p className="text-error text-sm mt-4">{error}</p>}
            <div className="mt-6 flex flex-col gap-3">
              {cita.can_cancel ? (
                <Button variant="danger" onClick={cancelar} isLoading={busy}>Cancelar cita</Button>
              ) : cita.status === 'pending' || cita.status === 'confirmed' ? (
                <p className="text-sm text-inverse/60">Ya pasó el plazo para cancelar en línea. Comunícate con la barbería.</p>
              ) : null}
              <Link href="/book" className="text-center text-primary underline text-sm">Agendar otra cita</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
