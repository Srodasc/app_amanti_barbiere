'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Modal } from '@/components/ui';
import { cn, getErrorMessage } from '@/lib/utils';
import { isValidMobile } from '@/lib/phone';
import { money, time12 } from '@/lib/appointments';

type Svc = { id: string; name: string; price: number; duration_minutes: number };
type Match = { id: string; name: string; visits_total: number; rewards_available: number } | null | 'none';

/**
 * Nueva cita desde el panel. El cliente se identifica por celular; se sugieren
 * horas libres y se permite "otra hora". create_staff_appointment valida el choque.
 */
export default function NewAppointmentModal({
  open,
  initial,
  barbers,
  onClose,
  onDone,
}: {
  open: boolean;
  initial: { date: string; barberId?: string | null };
  barbers: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [services, setServices] = useState<Svc[]>([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [match, setMatch] = useState<Match>(null);
  const [service, setService] = useState('');
  const [barber, setBarber] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState('');
  const [custom, setCustom] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPhone('');
    setName('');
    setMatch(null);
    setService('');
    setBarber(initial.barberId ?? '');
    setDate(initial.date);
    setTime('');
    setCustom(false);
    setNotes('');
    setError('');
    createClient()
      .from('services')
      .select('*') // sin columnas fijas: funciona antes y después de la migración de categorías
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setServices(((data ?? []) as (Svc & { kind?: string })[]).filter((s) => s.kind !== 'addon')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!isValidMobile(phone)) return setMatch(null);
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc('lookup_client_by_phone', { p_phone: phone });
      const row = Array.isArray(data) ? data[0] : data;
      setMatch(row ? row : 'none');
    }, 300);
    return () => clearTimeout(t);
  }, [phone]);

  useEffect(() => {
    if (!open || !service || !barber || !date) return setSlots(null);
    let alive = true;
    setSlots(null);
    createClient()
      .rpc('get_available_slots_excluding', { p_service: service, p_date: date, p_barber: barber, p_exclude: null })
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
  }, [open, service, barber, date]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (phone.trim() && !isValidMobile(phone)) return setError('El celular no es válido.');
    if (match === 'none' && name.trim().length < 2) return setError('Es un cliente nuevo: escribe su nombre.');
    if (!service || !barber || !date || !time) return setError('Completa servicio, barbero, día y hora.');
    setSaving(true);
    const { error } = await createClient().rpc('create_staff_appointment', {
      p_barber: barber,
      p_service: service,
      p_date: date,
      p_time: time,
      p_name: name.trim() || null,
      p_phone: phone.trim() || null,
      p_source: 'staff',
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      const m = error.message;
      return setError(
        m.includes('slot_unavailable')
          ? 'Ese barbero ya tiene una cita a esa hora.'
          : m.includes('invalid_phone')
            ? 'El celular no es válido.'
            : m.includes('invalid_name')
              ? 'Es un cliente nuevo: escribe su nombre.'
              : getErrorMessage(error)
      );
    }
    onDone();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Nueva cita" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Celular del cliente" type="tel" inputMode="tel" placeholder="300 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {match && match !== 'none' ? (
            <div className="self-end pb-2 text-sm text-success font-semibold">
              {match.name} · {match.visits_total} visitas
              {match.rewards_available > 0 && ` · tiene ${match.rewards_available} premio(s)`}
            </div>
          ) : (
            <Input label={match === 'none' ? 'Nombre del cliente nuevo' : 'Nombre (opcional)'} value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </div>
        {phone.trim() === '' && <p className="text-xs -mt-2 text-warning">Sin celular la cita queda como cliente de mostrador y no suma sellos.</p>}

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="na-service" className="block text-sm font-medium text-inverse/70 mb-2">
              Servicio
            </label>
            <select id="na-service" className="input-field" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Selecciona…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {money(s.price)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="na-barber" className="block text-sm font-medium text-inverse/70 mb-2">
              Barbero
            </label>
            <select id="na-barber" className="input-field" value={barber} onChange={(e) => setBarber(e.target.value)}>
              <option value="">Selecciona…</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-inverse/70 mb-2">Hora</legend>
          {!custom ? (
            <>
              {!service || !barber ? (
                <p className="text-sm text-inverse/60">Elige servicio y barbero para ver las horas libres.</p>
              ) : slots === null ? (
                <p className="text-sm text-inverse/60">Buscando horas libres…</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-inverse/70">No hay horas libres ese día.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
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
                Otra hora (cliente que llega sin cita, fuera de horario…)
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
        </fieldset>

        <div>
          <label htmlFor="na-notes" className="block text-sm font-medium text-inverse/70 mb-2">
            Notas (opcional)
          </label>
          <textarea id="na-notes" className="input-field resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-error font-semibold">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" isLoading={saving} className="flex-1">
            Agendar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
