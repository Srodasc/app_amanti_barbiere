'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { appointmentErrorMessage, money, time12 } from '@/lib/appointments';

type Target = {
  id: string;
  clientName: string | null;
  date: string;
  startTime: string;
  barberId: string | null;
  serviceId: string | null;
  hasReward: boolean;
};
type Svc = { id: string; name: string; price: number; duration_minutes: number };
type Sched = { barber_id: string; day_of_week: number; is_available: boolean };

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * Reprogramar: elegir barbero, día y hora libre (sin contar la propia cita).
 * "Otra hora" permite una hora fuera de la agenda (solo se valida que no choque con otra cita).
 * lockBarber: el barbero (Mi día) solo puede mover sus citas dentro de su agenda.
 */
export default function RescheduleModal({
  target,
  barbers,
  schedules,
  lockBarber = false,
  onClose,
  onDone,
}: {
  target: Target | null;
  barbers: { id: string; name: string }[];
  schedules: Sched[];
  lockBarber?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [services, setServices] = useState<Svc[]>([]);
  const [barber, setBarber] = useState('');
  const [service, setService] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState('');
  const [custom, setCustom] = useState(false);
  const [notify, setNotify] = useState(process.env.NEXT_PUBLIC_WHATSAPP_ACTIVE === 'true');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setBarber(target.barberId ?? barbers[0]?.id ?? '');
    setService(target.serviceId ?? '');
    setDate(target.date < ymd(new Date()) ? ymd(new Date()) : target.date);
    setTime('');
    setCustom(false);
    setError('');
    createClient()
      .from('services')
      .select('id, name, price, duration_minutes')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setServices((data ?? []) as Svc[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);
  const works = (d: Date) => schedules.some((s) => s.barber_id === barber && s.day_of_week === d.getDay() && s.is_available);

  useEffect(() => {
    if (!target || !barber || !service || !date) return;
    let alive = true;
    setSlots(null);
    createClient()
      .rpc('get_available_slots_excluding', { p_service: service, p_date: date, p_barber: barber, p_exclude: target.id })
      .then(({ data }) => {
        if (!alive) return;
        const list = ((data ?? []) as { slot_time: string }[]).map((r) => r.slot_time.slice(0, 5));
        setSlots(list);
        setTime((t) => (custom || list.includes(t) ? t : ''));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, barber, service, date]);

  if (!target) return null;
  const isSame = date === target.date && time === target.startTime.slice(0, 5) && barber === target.barberId && service === target.serviceId;

  const save = async () => {
    if (!time) return setError('Elige una hora.');
    setSaving(true);
    setError('');
    const { error } = await createClient().rpc('reschedule_appointment', {
      p_appointment: target.id,
      p_date: date,
      p_time: time,
      p_barber: barber,
      p_service: service !== target.serviceId ? service : null,
      p_force: custom,
      p_notify: notify,
    });
    setSaving(false);
    if (error) {
      const m = error.message;
      setError(
        m.includes('reward_applied')
          ? 'Tiene un premio aplicado: quítalo antes de cambiar el servicio.'
          : m.includes('date_in_past')
            ? 'No se puede mover al pasado.'
            : m.includes('slot_unavailable')
              ? custom
                ? 'Esa hora choca con otra cita del barbero.'
                : 'Esa hora ya no está libre. Elige otra.'
              : appointmentErrorMessage(error)
      );
      return;
    }
    onDone();
  };

  return (
    <Modal isOpen onClose={onClose} title="Reprogramar cita" size="lg">
      <div className="space-y-5">
        <p className="text-sm text-inverse/70">
          <strong className="text-inverse">{target.clientName ?? 'Cliente'}</strong> · ahora el{' '}
          {format(new Date(`${target.date}T00:00:00`), "EEE d 'de' MMM", { locale: es })} a las {time12(target.startTime)}
        </p>

        {!lockBarber && (
          <fieldset>
            <legend className="text-sm font-bold mb-2">Barbero</legend>
            <div className="flex flex-wrap gap-2">
              {barbers.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBarber(b.id)}
                  aria-pressed={barber === b.id}
                  className={cn(
                    'px-3.5 min-h-[40px] rounded-full border text-sm font-semibold',
                    barber === b.id ? 'bg-inverse text-white border-inverse' : 'border-surface-300 hover:border-primary'
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="rs-service" className="block text-sm font-bold mb-2">
            Servicio
          </label>
          <select id="rs-service" className="input-field" value={service} onChange={(e) => setService(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {money(s.price)} · {s.duration_minutes} min
              </option>
            ))}
          </select>
          {target.hasReward && service !== target.serviceId && (
            <p className="text-xs text-warning mt-1">Tiene un premio aplicado: quítalo antes de cambiar el servicio.</p>
          )}
        </div>

        <fieldset className="min-w-0">
          <legend className="text-sm font-bold mb-2">Día</legend>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => {
              const k = ymd(d);
              const off = !works(d);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={off}
                  onClick={() => setDate(k)}
                  aria-pressed={date === k}
                  className={cn(
                    'shrink-0 w-14 py-2 rounded-lg border text-center',
                    date === k ? 'bg-primary text-white border-primary' : 'border-surface-300 hover:border-primary',
                    off && 'opacity-40 line-through cursor-not-allowed hover:border-surface-300'
                  )}
                >
                  <span className="block text-[11px] uppercase font-bold">{format(d, 'EEE', { locale: es })}</span>
                  <span className="block text-base font-bold">{format(d, 'd')}</span>
                </button>
              );
            })}
          </div>
          <label className="inline-flex items-center gap-2 mt-2 text-xs text-inverse/70">
            Otra fecha:
            <input type="date" className="input-field !py-1 !w-auto" value={date} min={ymd(new Date())} onChange={(e) => setDate(e.target.value)} />
          </label>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold mb-2">Hora</legend>
          {!custom ? (
            <>
              {slots === null ? (
                <p className="text-sm text-inverse/60">Buscando horas libres…</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-inverse/70">No hay horas libres ese día para este barbero.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTime(s)}
                      aria-pressed={time === s}
                      className={cn(
                        'min-h-[40px] rounded-lg border text-sm font-semibold',
                        time === s ? 'bg-primary text-white border-primary' : 'border-surface-300 hover:border-primary'
                      )}
                    >
                      {time12(s)}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { setCustom(true); setTime(''); }} className="mt-2 text-sm font-semibold text-primary-700 underline">
                Otra hora (fuera de la agenda)
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <input type="time" className="input-field !w-auto" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Hora" />
              <button type="button" onClick={() => { setCustom(false); setTime(''); }} className="text-sm font-semibold text-primary-700 underline">
                Ver horas libres
              </button>
            </div>
          )}
          {custom && <p className="text-xs text-inverse/60 mt-1">Se permite fuera del horario o en un descanso; nunca encima de otra cita.</p>}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 accent-primary" />
          Avisar al cliente por WhatsApp con la nueva hora
        </label>

        {error && (
          <p role="alert" className="text-sm text-error font-semibold">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Volver
          </Button>
          <Button onClick={save} isLoading={saving} disabled={!time || isSame} className="flex-1">
            {time ? `Mover a las ${time12(time)}` : 'Elige una hora'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
