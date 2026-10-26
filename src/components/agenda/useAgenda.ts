'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/*
 * Datos de la agenda para un rango de fechas: citas, barberos, horarios,
 * descansos, días especiales, bloqueos y ventas de productos (para ingresos).
 * Se actualiza sola cuando cambia una cita (Supabase Realtime).
 */

export type AgendaAppointment = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  barber_id: string | null;
  client_id: string | null;
  service_id: string | null;
  price: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  reward_rule_id: string | null;
  notes: string | null;
  source: string | null;
  client_name: string | null;
  cancel_reason: string | null;
  client: { id: string; name: string; phone: string | null } | null;
  service: { id: string; name: string; price: number; duration_minutes: number } | null;
  barber: { id: string; name: string } | null;
};
export type AgendaBarber = { id: string; name: string };
export type Schedule = { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean };
export type Break = { barber_id: string; day_of_week: number; start_time: string; end_time: string };
export type Override = { barber_id: string; date: string; is_available: boolean; start_time: string | null; end_time: string | null; reason: string | null };
export type TimeOff = { barber_id: string; starts_at: string; ends_at: string; reason: string | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export function useAgenda(from: string, to: string, onNewWebBooking?: (a: { id: string; date: string; start_time: string; client_name: string | null }) => void) {
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [barbers, setBarbers] = useState<AgendaBarber[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [productSales, setProductSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const onNew = useRef(onNewWebBooking);
  onNew.current = onNewWebBooking;

  const load = useCallback(async () => {
    const db = createClient();
    const [a, b, s, br, o, t, ps] = await Promise.all([
      db
        .from('appointments')
        .select(
          'id, date, start_time, end_time, status, barber_id, client_id, service_id, price, paid_amount, payment_method, reward_rule_id, notes, source, client_name, cancel_reason, client:clients(id, name, phone), service:services(id, name, price, duration_minutes), barber:barbers(id, name)'
        )
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('start_time'),
      db.from('barbers').select('id, name').eq('is_active', true).order('name'),
      db.from('barber_schedules').select('barber_id, day_of_week, start_time, end_time, is_available'),
      db.from('barber_breaks').select('barber_id, day_of_week, start_time, end_time'),
      db.from('schedule_overrides').select('barber_id, date, is_available, start_time, end_time, reason').gte('date', from).lte('date', to),
      db.from('time_off').select('barber_id, starts_at, ends_at, reason').lte('starts_at', `${to}T23:59:59`).gte('ends_at', `${from}T00:00:00`),
      db
        .from('product_sales')
        .select('total')
        .eq('status', 'completed')
        .gte('created_at', new Date(`${from}T00:00:00`).toISOString())
        .lt('created_at', new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString()),
    ]);
    const err = a.error || b.error;
    setError(err ? err.message : '');
    setAppointments(
      ((a.data ?? []) as unknown as (AgendaAppointment & { client: unknown; service: unknown; barber: unknown })[]).map((r) => ({
        ...r,
        client: one(r.client as AgendaAppointment['client'] | AgendaAppointment['client'][]),
        service: one(r.service as AgendaAppointment['service'] | AgendaAppointment['service'][]),
        barber: one(r.barber as AgendaAppointment['barber'] | AgendaAppointment['barber'][]),
      }))
    );
    setBarbers((b.data ?? []) as AgendaBarber[]);
    setSchedules((s.data ?? []) as Schedule[]);
    setBreaks((br.data ?? []) as Break[]);
    setOverrides((o.data ?? []) as Override[]);
    setTimeOff((t.data ?? []) as TimeOff[]);
    setProductSales(((ps.data ?? []) as { total: number }[]).reduce((sum, r) => sum + Number(r.total || 0), 0));
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Actualización en vivo: cualquier cambio en citas recarga; las reservas web nuevas se avisan
  useEffect(() => {
    const db = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = db
      .channel('agenda-citas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(load, 400);
        const n = payload.new as { id?: string; source?: string; date?: string; start_time?: string; client_name?: string | null };
        if (payload.eventType === 'INSERT' && n?.source === 'web' && n.id && n.date && n.start_time) {
          onNew.current?.({ id: n.id, date: n.date, start_time: n.start_time, client_name: n.client_name ?? null });
        }
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      db.removeChannel(channel);
    };
  }, [load]);

  return { appointments, barbers, schedules, breaks, overrides, timeOff, productSales, loading, error, reload: load };
}

/** Ventana de trabajo de un barbero en una fecha (día especial > horario semanal), o null si no trabaja */
export function workWindow(barberId: string, date: string, schedules: Schedule[], overrides: Override[]) {
  const ov = overrides.find((o) => o.barber_id === barberId && o.date === date);
  if (ov) return ov.is_available && ov.start_time && ov.end_time ? { start: ov.start_time, end: ov.end_time, reason: null } : { start: null, end: null, reason: ov.reason || 'Día especial' };
  const dow = new Date(`${date}T00:00:00`).getDay();
  const s = schedules.find((x) => x.barber_id === barberId && x.day_of_week === dow && x.is_available);
  return s ? { start: s.start_time, end: s.end_time, reason: null } : { start: null, end: null, reason: 'No trabaja' };
}
