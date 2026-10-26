'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarClock, CalendarPlus, Check, MapPin } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { rewardText } from '@/lib/loyalty';
import { downloadIcs, googleCalendarUrl, mapsUrl } from '@/lib/calendar';

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
  can_reschedule?: boolean;
  reschedules_left?: number;
  duration_minutes?: number | null;
  deadline_hours?: number | null;
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
type Day = { date: string; status: 'open' | 'closed'; slots: number; label: string | null };

const ESTADOS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

function time12(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (d: string) => cap(format(parseISO(d), "EEEE d 'de' MMMM", { locale: es }));

export default function CitaPage() {
  const { token } = useParams<{ token: string }>();
  const [cita, setCita] = useState<Cita | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/cita/${token}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Cita no encontrada');
      setCita(d);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelar = async () => {
    if (!confirm('¿Seguro que quieres cancelar tu cita?')) return;
    setBusy(true);
    setError('');
    const r = await fetch(`/api/cita/${token}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok) setError(d.error || 'No se pudo cancelar');
    else setCita((c) => (c ? { ...c, status: 'cancelled', can_cancel: false, can_reschedule: false } : c));
    setBusy(false);
  };

  const active = cita && (cita.status === 'pending' || cita.status === 'confirmed');
  const ev =
    cita && active
      ? {
          uid: token,
          date: cita.date,
          time: cita.start_time.slice(0, 5),
          minutes: cita.duration_minutes ?? 30,
          title: `${cita.service_name ?? 'Cita'} en Amanti Barbiere`,
          details: `Tu cita${cita.barber_name ? ` con ${cita.barber_name}` : ''}. Ver, cambiar o cancelar: ${typeof window !== 'undefined' ? window.location.href : ''}`,
          location: cita.business_address,
        }
      : null;
  const maps = mapsUrl(cita?.business_address);

  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8 sm:py-10 bg-surface">
      <div className="w-full max-w-md bg-white rounded-xl border border-surface-300 p-5 sm:p-6">
        <h1 className="text-2xl font-heading font-bold text-inverse mb-4">Tu cita</h1>
        {loading && <p className="text-inverse/60">Cargando...</p>}
        {!loading && !cita && <p className="text-error">{error}</p>}
        {cita && (
          <>
            {moved && (
              <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-success/10 text-success font-semibold px-3 py-2 text-sm">
                <Check className="w-4 h-4" aria-hidden="true" /> Listo, tu cita quedó con la nueva fecha y hora.
              </p>
            )}
            <dl className="space-y-2 text-inverse">
              <div>
                <dt className="text-sm text-inverse/70">Servicio</dt>
                <dd className="font-semibold">{cita.service_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-inverse/70">Barbero</dt>
                <dd className="font-semibold">{cita.barber_name ?? 'Por asignar'}</dd>
              </div>
              <div>
                <dt className="text-sm text-inverse/70">Fecha y hora</dt>
                <dd className="font-semibold">
                  {longDate(cita.date)} · {time12(cita.start_time)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-inverse/70">Estado</dt>
                <dd className="font-semibold">{ESTADOS[cita.status] ?? cita.status}</dd>
              </div>
              {cita.business_address && (
                <div>
                  <dt className="text-sm text-inverse/70">Dirección</dt>
                  <dd>{cita.business_address}</dd>
                </div>
              )}
            </dl>

            {ev && (
              <div className={cn('mt-5 grid gap-2', maps ? 'grid-cols-2' : 'grid-cols-1')}>
                <button
                  type="button"
                  onClick={() => downloadIcs(ev)}
                  className="min-h-[48px] rounded-lg border border-surface-400 bg-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <CalendarPlus className="w-4 h-4" aria-hidden="true" /> A mi calendario
                </button>
                {maps && (
                  <a
                    href={maps}
                    target="_blank"
                    rel="noopener"
                    className="min-h-[48px] rounded-lg border border-surface-400 bg-white font-semibold text-sm flex items-center justify-center gap-2 text-inverse no-underline"
                  >
                    <MapPin className="w-4 h-4" aria-hidden="true" /> Cómo llegar
                  </a>
                )}
                <p className={cn('text-center text-xs text-inverse/70', maps && 'col-span-2')}>
                  ¿Usas Google Calendar?{' '}
                  <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener" className="text-primary underline">
                    Agrégala ahí
                  </a>
                </p>
              </div>
            )}

            {moving && cita.can_reschedule ? (
              <Reschedule
                token={token}
                current={cita}
                onCancel={() => setMoving(false)}
                onDone={async () => {
                  setMoving(false);
                  setMoved(true);
                  await load();
                  window.scrollTo({ top: 0 });
                }}
              />
            ) : (
              <>
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
                          <p className="text-xs text-inverse/70">
                            {l.visits} de {l.visits_required} visitas · premio: {premio}
                            {l.rewards_available > 0 && (
                              <strong className="text-primary">
                                {' '}
                                · ¡Tienes {l.rewards_available} disponible{l.rewards_available > 1 ? 's' : ''}! Pídelo en tu próxima cita.
                              </strong>
                            )}
                          </p>
                          {l.description && <p className="text-xs text-inverse/60">{l.description}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {error && <p className="text-error text-sm mt-4">{error}</p>}
                <div className="mt-6 flex flex-col gap-3">
                  {cita.can_reschedule && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoved(false);
                        setMoving(true);
                      }}
                      className="h-12 rounded-lg bg-primary text-white font-bold flex items-center justify-center gap-2"
                    >
                      <CalendarClock className="w-5 h-5" aria-hidden="true" /> Cambiar fecha u hora
                    </button>
                  )}
                  {cita.can_cancel ? (
                    <Button variant="ghost" onClick={cancelar} isLoading={busy} className="!text-error">
                      Cancelar cita
                    </Button>
                  ) : active ? (
                    <p className="text-sm text-inverse/70">Ya pasó el plazo para cambiar o cancelar en línea. Comunícate con la barbería.</p>
                  ) : null}
                  {active && !cita.can_reschedule && cita.can_cancel && cita.reschedules_left === 0 && (
                    <p className="text-xs text-inverse/70">Ya cambiaste esta cita las veces permitidas. Para otro cambio, comunícate con la barbería.</p>
                  )}
                  <Link href="/book" className="text-center text-primary underline text-sm">
                    Agendar otra cita
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Elegir nuevo día y hora (mismo barbero y servicio). La cita actual se conserva hasta confirmar. */
function Reschedule({ token, current, onCancel, onDone }: { token: string; current: Cita; onCancel: () => void; onDone: () => void }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch(`/api/cita/${token}/reprogramar`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const list: Day[] = Array.isArray(d) ? d : [];
        setDays(list);
        // Empieza en el día de la cita actual (si tiene otros horarios); si no, el primero con cupo
        const open = (d: string | null) => !!d && list.some((x) => x.date === d && x.status === 'open');
        setDate((cur) => (open(cur) ? cur : open(current.date) ? current.date : list.find((x) => x.status === 'open')?.date ?? null));
      })
      .catch(() => setDays([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reload]);

  useEffect(() => {
    if (!date) return;
    let alive = true;
    setSlots(null);
    fetch(`/api/cita/${token}/reprogramar?date=${date}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list: string[] = Array.isArray(d) ? d : [];
        setSlots(list);
        setTime((t) => (t && list.includes(t) ? t : null));
      })
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [token, date, reload]);

  const isCurrent = (d: string | null, t: string | null) => d === current.date && t === current.start_time.slice(0, 5);

  const save = async () => {
    if (!date || !time) return;
    setSaving(true);
    setError('');
    const r = await fetch(`/api/cita/${token}/reprogramar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time }),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      setError(d.error || 'No se pudo cambiar la cita.');
      if (d.code === 'slot_unavailable') {
        setTime(null);
        setReload((n) => n + 1);
      }
      return;
    }
    onDone();
  };

  return (
    <section className="mt-6 border-t border-inverse/10 pt-5 space-y-4" aria-label="Cambiar fecha u hora">
      <div>
        <h2 className="font-heading text-lg font-bold">Cambiar fecha u hora</h2>
        <p className="text-sm text-inverse/70">
          Con {current.barber_name ?? 'el mismo barbero'}. Tu cita actual se mantiene hasta que confirmes la nueva.
          {typeof current.reschedules_left === 'number' && current.reschedules_left <= 1 && ' Este es el último cambio que puedes hacer en línea.'}
        </p>
      </div>

      {days === null ? (
        <p className="text-sm text-inverse/70">Buscando días disponibles...</p>
      ) : !days.some((d) => d.status === 'open') ? (
        <p className="text-sm text-inverse/70">No hay otros horarios libres en los próximos días. Comunícate con la barbería.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 sm:-mx-6 sm:px-6 pb-1">
            {days.map((d) => {
              const disabled = d.status !== 'open';
              const selected = d.date === date;
              const dt = parseISO(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setDate(d.date);
                    setTime(null);
                  }}
                  aria-pressed={selected}
                  aria-label={`${longDate(d.date)}${disabled ? ', sin cupos' : ''}`}
                  className={cn(
                    'w-[58px] min-h-[70px] shrink-0 rounded-xl flex flex-col items-center justify-center gap-0.5 border',
                    selected
                      ? 'bg-primary text-white border-primary'
                      : disabled
                        ? 'bg-surface-200 text-[#6b6461] border-dashed border-surface-500 cursor-not-allowed'
                        : 'bg-white border-surface-400 hover:border-primary'
                  )}
                >
                  <span className="text-xs font-semibold capitalize">{format(dt, 'EEE', { locale: es })}</span>
                  <span className={cn('text-lg font-bold leading-none', disabled && 'line-through')}>{format(dt, 'd')}</span>
                  <span className="text-[10px] font-semibold capitalize">{format(dt, 'MMM', { locale: es })}</span>
                </button>
              );
            })}
          </div>

          {date && (
            <div className="space-y-2">
              <p className="font-semibold">{longDate(date)}</p>
              {slots === null ? (
                <p className="text-sm text-inverse/70">Cargando horarios...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-inverse/70">Este día ya no tiene horarios. Elige otro.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((s) => {
                    const cur = isCurrent(date, s);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={cur}
                        onClick={() => setTime(s)}
                        aria-pressed={time === s}
                        className={cn(
                          'min-h-[48px] rounded-lg border text-sm font-bold flex flex-col items-center justify-center',
                          time === s ? 'bg-primary text-white border-primary' : 'bg-white border-surface-400 hover:border-primary',
                          cur && 'opacity-60 cursor-not-allowed hover:border-surface-400'
                        )}
                      >
                        {time12(s)}
                        {cur && <span className="text-[10px] font-semibold">Tu hora actual</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-error font-semibold">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!date || !time || saving}
          className="h-12 rounded-lg bg-primary text-white font-bold disabled:bg-surface-400 disabled:text-inverse/60"
        >
          {saving ? 'Guardando…' : date && time ? `Cambiar al ${format(parseISO(date), "EEE d 'de' MMM", { locale: es })}, ${time12(time)}` : 'Elige día y hora'}
        </button>
        <button type="button" onClick={onCancel} className="h-11 rounded-lg border border-surface-400 font-semibold">
          Mantener mi cita actual
        </button>
      </div>
    </section>
  );
}
