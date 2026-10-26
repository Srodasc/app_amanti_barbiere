'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Coffee, CalendarX, Ban, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Select, Modal, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { DAYS_OF_WEEK, type DayOfWeek } from '@/types';

/**
 * Descansos fijos (ej. almuerzo), días especiales (no trabaja / horario distinto)
 * y bloqueos de tiempo (cita médica, vacaciones…).
 * La disponibilidad pública ya los tiene en cuenta en la base de datos (get_available_slots).
 *
 * canEditBreaks: los descansos fijos solo los edita el administrador (RLS);
 * el barbero los ve pero gestiona sus propios días especiales y bloqueos.
 */

type Break = { id: string; day_of_week: number; start_time: string; end_time: string };
type Override = {
  id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};
type TimeOff = { id: string; starts_at: string; ends_at: string; reason: string | null };
type Conflict = { id: string; date: string; start_time: string; end_time: string; client_name: string | null };

type Pending = { kind: 'override' | 'time_off' | 'break'; save: () => Promise<void>; conflicts: Conflict[] };

const ACTIVE = ['pending', 'confirmed', 'in_progress'];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};
const today = () => format(new Date(), 'yyyy-MM-dd');
const nowLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
const nice = (d: string) => format(new Date(`${d}T00:00:00`), "EEE d 'de' MMM", { locale: es });
const niceTs = (ts: string) => format(new Date(ts.replace(' ', 'T')), "EEE d MMM, HH:mm", { locale: es });

const DAY_ORDER: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];

export default function AvailabilityExtras({
  barberId,
  canEditBreaks,
}: {
  barberId: string;
  canEditBreaks: boolean;
}) {
  const supabase = createClient();
  const { showToast } = useToast();

  const [breaks, setBreaks] = useState<Break[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<'break' | 'override' | 'time_off' | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const [breakForm, setBreakForm] = useState({ days: [1, 2, 3, 4, 5, 6] as number[], start: '12:00', end: '13:00' });
  const [ovForm, setOvForm] = useState({ date: today(), mode: 'closed' as 'closed' | 'custom', start: '09:00', end: '14:00', reason: '' });
  const [toForm, setToForm] = useState({ startDate: today(), startTime: '09:00', endDate: today(), endTime: '12:00', reason: '' });
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [b, o, t] = await Promise.all([
      supabase.from('barber_breaks').select('id, day_of_week, start_time, end_time').eq('barber_id', barberId).order('start_time'),
      supabase
        .from('schedule_overrides')
        .select('id, date, is_available, start_time, end_time, reason')
        .eq('barber_id', barberId)
        .gte('date', today())
        .order('date'),
      supabase
        .from('time_off')
        .select('id, starts_at, ends_at, reason')
        .eq('barber_id', barberId)
        .gte('ends_at', nowLocal())
        .order('starts_at'),
    ]);
    const err = b.error || o.error || t.error;
    if (err) showToast(err.message, 'error');
    setBreaks((b.data ?? []) as Break[]);
    setOverrides((o.data ?? []) as Override[]);
    setTimeOff((t.data ?? []) as TimeOff[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- citas que chocan con lo que se va a bloquear ----------
  const appointmentsBetween = async (fromDate: string, toDate: string) => {
    const { data } = await supabase
      .from('appointments')
      .select('id, date, start_time, end_time, client:clients(name), client_name')
      .eq('barber_id', barberId)
      .in('status', ACTIVE)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date')
      .order('start_time');
    type Row = Conflict & { client: { name: string } | { name: string }[] | null };
    return ((data ?? []) as unknown as Row[]).map((r) => {
      const c = Array.isArray(r.client) ? r.client[0] : r.client;
      return { id: r.id, date: r.date, start_time: r.start_time, end_time: r.end_time, client_name: c?.name ?? r.client_name };
    });
  };

  const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);

  /** Ejecuta save() directamente, o primero muestra las citas afectadas para confirmar. */
  const withConflictCheck = async (kind: Pending['kind'], conflicts: Conflict[], save: () => Promise<void>) => {
    if (conflicts.length === 0) {
      await save();
    } else {
      setPending({ kind, conflicts, save });
    }
  };

  const finish = async (ok: boolean, msg: string, err?: string) => {
    if (ok) {
      showToast(msg, 'success');
      setModal(null);
      setPending(null);
      await load();
    } else {
      showToast(err || 'No se pudo guardar', 'error');
    }
  };

  // ---------- descansos fijos ----------
  const saveBreak = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (breakForm.days.length === 0) return setFormError('Elige al menos un día');
    if (breakForm.start >= breakForm.end) return setFormError('La hora final debe ser mayor que la inicial');
    const clash = breaks.find(
      (b) => breakForm.days.includes(b.day_of_week) && overlaps(breakForm.start, breakForm.end, b.start_time, b.end_time)
    );
    if (clash) return setFormError(`Se cruza con un descanso existente del ${DAYS_OF_WEEK[clash.day_of_week as DayOfWeek]}`);

    setSaving(true);
    const horizon = format(new Date(Date.now() + 60 * 864e5), 'yyyy-MM-dd');
    const upcoming = await appointmentsBetween(today(), horizon);
    const conflicts = upcoming.filter(
      (a) =>
        breakForm.days.includes(new Date(`${a.date}T00:00:00`).getDay()) &&
        overlaps(a.start_time, a.end_time, breakForm.start, breakForm.end)
    );
    setSaving(false);

    await withConflictCheck('break', conflicts, async () => {
      setSaving(true);
      const { error } = await supabase.from('barber_breaks').insert(
        breakForm.days.map((d) => ({ barber_id: barberId, day_of_week: d, start_time: breakForm.start, end_time: breakForm.end }))
      );
      setSaving(false);
      await finish(!error, 'Descanso agregado', error?.message);
    });
  };

  // ---------- días especiales ----------
  const saveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!ovForm.date) return setFormError('Elige la fecha');
    if (ovForm.date < today()) return setFormError('La fecha ya pasó');
    if (ovForm.mode === 'custom' && ovForm.start >= ovForm.end) return setFormError('La hora final debe ser mayor que la inicial');

    setSaving(true);
    const sameDay = await appointmentsBetween(ovForm.date, ovForm.date);
    // Cerrado: todas chocan. Horario distinto: chocan las que quedan fuera del nuevo horario.
    const conflicts =
      ovForm.mode === 'closed'
        ? sameDay
        : sameDay.filter((a) => toMin(a.start_time) < toMin(ovForm.start) || toMin(a.end_time) > toMin(ovForm.end));
    setSaving(false);

    await withConflictCheck('override', conflicts, async () => {
      setSaving(true);
      const { error } = await supabase.from('schedule_overrides').upsert(
        {
          barber_id: barberId,
          date: ovForm.date,
          is_available: ovForm.mode === 'custom',
          start_time: ovForm.mode === 'custom' ? ovForm.start : null,
          end_time: ovForm.mode === 'custom' ? ovForm.end : null,
          reason: ovForm.reason.trim() || null,
        },
        { onConflict: 'barber_id,date' }
      );
      setSaving(false);
      await finish(!error, 'Día especial guardado', error?.message);
    });
  };

  // ---------- bloqueos ----------
  const saveTimeOff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const starts = `${toForm.startDate}T${toForm.startTime}:00`;
    const ends = `${toForm.endDate}T${toForm.endTime}:00`;
    if (!toForm.startDate || !toForm.endDate) return setFormError('Completa las fechas');
    if (ends <= starts) return setFormError('El final debe ser posterior al inicio');
    if (ends <= nowLocal()) return setFormError('Ese periodo ya pasó');

    setSaving(true);
    const range = await appointmentsBetween(toForm.startDate, toForm.endDate);
    const conflicts = range.filter((a) => {
      const aStart = `${a.date}T${hhmm(a.start_time)}:00`;
      const aEnd = `${a.date}T${hhmm(a.end_time)}:00`;
      return aStart < ends && starts < aEnd;
    });
    setSaving(false);

    await withConflictCheck('time_off', conflicts, async () => {
      setSaving(true);
      const { error } = await supabase
        .from('time_off')
        .insert({ barber_id: barberId, starts_at: starts, ends_at: ends, reason: toForm.reason.trim() || null });
      setSaving(false);
      await finish(!error, 'Bloqueo agregado', error?.message);
    });
  };

  const remove = async (table: 'barber_breaks' | 'schedule_overrides' | 'time_off', id: string) => {
    if (!confirm('¿Eliminar? Ese tiempo volverá a quedar disponible para reservas.')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    else {
      showToast('Eliminado', 'success');
      load();
    }
  };

  const open = (m: 'break' | 'override' | 'time_off') => {
    setFormError('');
    if (m === 'override') setOvForm({ date: today(), mode: 'closed', start: '09:00', end: '14:00', reason: '' });
    if (m === 'time_off') setToForm({ startDate: today(), startTime: '09:00', endDate: today(), endTime: '12:00', reason: '' });
    setModal(m);
  };

  const toggleDay = (d: number) =>
    setBreakForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }));

  const breaksByDay = DAY_ORDER.map((d) => ({ day: d, items: breaks.filter((b) => b.day_of_week === d) })).filter(
    (g) => g.items.length > 0
  );

  const Empty = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm text-inverse/50 py-2">{children}</p>
  );
  const DelBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="p-2 text-inverse/60 hover:text-error hover:bg-surface-container-low rounded-lg transition-colors"
      aria-label="Eliminar"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Descansos fijos */}
      <Card hover={false}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex gap-3">
            <Coffee className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-inverse">Descansos fijos</h2>
              <p className="text-sm text-inverse/60">Se repiten cada semana, por ejemplo el almuerzo.</p>
            </div>
          </div>
          {canEditBreaks && (
            <Button size="sm" onClick={() => open('break')}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          )}
        </div>
        {loading ? (
          <Empty>Cargando...</Empty>
        ) : breaksByDay.length === 0 ? (
          <Empty>Sin descansos fijos.</Empty>
        ) : (
          <ul className="divide-y divide-surface-container-low">
            {breaksByDay.map(({ day, items }) => (
              <li key={day} className="py-2 flex items-center justify-between gap-2">
                <span className="font-medium w-24 shrink-0">{DAYS_OF_WEEK[day]}</span>
                <div className="flex flex-wrap gap-2 flex-1">
                  {items.map((b) => (
                    <span key={b.id} className="inline-flex items-center gap-1 bg-surface rounded px-2 py-1 text-sm">
                      {hhmm(b.start_time)}–{hhmm(b.end_time)}
                      {canEditBreaks && (
                        <button
                          onClick={() => remove('barber_breaks', b.id)}
                          className="text-inverse/50 hover:text-error ml-1"
                          aria-label="Eliminar descanso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!canEditBreaks && <p className="text-xs text-inverse/50 mt-2">Los descansos fijos los cambia el administrador.</p>}
      </Card>

      {/* Días especiales */}
      <Card hover={false}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex gap-3">
            <CalendarX className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-inverse">Días especiales</h2>
              <p className="text-sm text-inverse/60">Un día que no trabaja o con horario distinto (festivos, eventos).</p>
            </div>
          </div>
          <Button size="sm" onClick={() => open('override')}>
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>
        {loading ? (
          <Empty>Cargando...</Empty>
        ) : overrides.length === 0 ? (
          <Empty>Sin días especiales próximos.</Empty>
        ) : (
          <ul className="divide-y divide-surface-container-low">
            {overrides.map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium capitalize">{nice(o.date)}</p>
                  <p className="text-sm text-inverse/60">
                    {o.is_available ? `Horario: ${hhmm(o.start_time)}–${hhmm(o.end_time)}` : 'No trabaja'}
                    {o.reason && ` · ${o.reason}`}
                  </p>
                </div>
                <DelBtn onClick={() => remove('schedule_overrides', o.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Bloqueos */}
      <Card hover={false}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex gap-3">
            <Ban className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-inverse">Bloqueos de tiempo</h2>
              <p className="text-sm text-inverse/60">Unas horas o varios días seguidos (cita médica, vacaciones).</p>
            </div>
          </div>
          <Button size="sm" onClick={() => open('time_off')}>
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>
        {loading ? (
          <Empty>Cargando...</Empty>
        ) : timeOff.length === 0 ? (
          <Empty>Sin bloqueos próximos.</Empty>
        ) : (
          <ul className="divide-y divide-surface-container-low">
            {timeOff.map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium capitalize">
                    {niceTs(t.starts_at)} → {niceTs(t.ends_at)}
                  </p>
                  {t.reason && <p className="text-sm text-inverse/60">{t.reason}</p>}
                </div>
                <DelBtn onClick={() => remove('time_off', t.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- Modales ---------- */}
      <Modal isOpen={modal === 'break' && !pending} onClose={() => setModal(null)} title="Agregar descanso fijo">
        <form onSubmit={saveBreak} className="space-y-4">
          <div>
            <p className="text-sm font-medium text-inverse/70 mb-2">Días</p>
            <div className="flex flex-wrap gap-2">
              {DAY_ORDER.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    breakForm.days.includes(d) ? 'bg-primary text-white border-primary' : 'border-inverse/20 text-inverse/70'
                  }`}
                >
                  {DAYS_OF_WEEK[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Desde" type="time" value={breakForm.start} onChange={(e) => setBreakForm({ ...breakForm, start: e.target.value })} />
            <Input label="Hasta" type="time" value={breakForm.end} onChange={(e) => setBreakForm({ ...breakForm, end: e.target.value })} />
          </div>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modal === 'override' && !pending} onClose={() => setModal(null)} title="Día especial">
        <form onSubmit={saveOverride} className="space-y-4">
          <Input label="Fecha" type="date" min={today()} value={ovForm.date} onChange={(e) => setOvForm({ ...ovForm, date: e.target.value })} />
          <Select
            label="Ese día"
            value={ovForm.mode}
            onChange={(e) => setOvForm({ ...ovForm, mode: e.target.value as 'closed' | 'custom' })}
            options={[
              { value: 'closed', label: 'No trabaja' },
              { value: 'custom', label: 'Trabaja con horario distinto' },
            ]}
          />
          {ovForm.mode === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Desde" type="time" value={ovForm.start} onChange={(e) => setOvForm({ ...ovForm, start: e.target.value })} />
              <Input label="Hasta" type="time" value={ovForm.end} onChange={(e) => setOvForm({ ...ovForm, end: e.target.value })} />
            </div>
          )}
          <Input label="Motivo (opcional)" placeholder="Ej: festivo" value={ovForm.reason} onChange={(e) => setOvForm({ ...ovForm, reason: e.target.value })} />
          <p className="text-xs text-inverse/50">Si ya existe un día especial en esa fecha, se reemplaza.</p>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modal === 'time_off' && !pending} onClose={() => setModal(null)} title="Bloquear tiempo">
        <form onSubmit={saveTimeOff} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Desde (fecha)"
              type="date"
              min={today()}
              value={toForm.startDate}
              onChange={(e) =>
                setToForm({
                  ...toForm,
                  startDate: e.target.value,
                  endDate: toForm.endDate < e.target.value ? e.target.value : toForm.endDate,
                })
              }
            />
            <Input label="Hora" type="time" value={toForm.startTime} onChange={(e) => setToForm({ ...toForm, startTime: e.target.value })} />
            <Input label="Hasta (fecha)" type="date" min={toForm.startDate} value={toForm.endDate} onChange={(e) => setToForm({ ...toForm, endDate: e.target.value })} />
            <Input label="Hora" type="time" value={toForm.endTime} onChange={(e) => setToForm({ ...toForm, endTime: e.target.value })} />
          </div>
          <Input label="Motivo (opcional)" placeholder="Ej: cita médica" value={toForm.reason} onChange={(e) => setToForm({ ...toForm, reason: e.target.value })} />
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!pending} onClose={() => setPending(null)} title="Hay citas en ese horario">
        {pending && (
          <div className="space-y-4">
            <div className="flex gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p>
                {pending.conflicts.length === 1 ? 'Esta cita ya agendada choca' : `Estas ${pending.conflicts.length} citas ya agendadas chocan`} con
                lo que vas a bloquear. <strong>No se cancelan solas</strong>: si guardas, avisa a cada cliente y cancélalas o muévelas desde Citas.
              </p>
            </div>
            <ul className="max-h-56 overflow-y-auto divide-y divide-surface-container-low text-sm">
              {pending.conflicts.map((c) => (
                <li key={c.id} className="py-2 flex justify-between gap-2">
                  <span className="capitalize">{nice(c.date)} · {hhmm(c.start_time)}</span>
                  <span className="text-inverse/70 truncate">{c.client_name ?? 'Cliente'}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPending(null)} className="flex-1">Volver</Button>
              <Button type="button" isLoading={saving} onClick={() => pending.save()} className="flex-1">Guardar de todos modos</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
