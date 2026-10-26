import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UUID_RE, clientIp, rateLimit } from '@/lib/rate-limit';
import { noStoreFetch } from '@/lib/supabase/no-store';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }, global: { fetch: noStoreFetch },
  });
}

/**
 * Reprogramar con el enlace privado (mismo barbero y servicio).
 *   GET              → días con horarios libres
 *   GET ?date=AAAA-MM-DD → horarios libres de ese día
 */
export async function GET(request: Request, { params }: { params: { token: string } }) {
  if (!rateLimit(`resched-read:${clientIp(request)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Espera un momento.' }, { status: 429 });
  }
  if (!UUID_RE.test(params.token)) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });

  const date = new URL(request.url).searchParams.get('date');
  if (date) {
    if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
    const { data, error } = await anon().rpc('reschedule_slots_by_token', { p_token: params.token, p_date: date });
    if (error) {
      console.error('reschedule_slots_by_token', error.message);
      return NextResponse.json({ error: 'No se pudieron cargar los horarios' }, { status: 500 });
    }
    const slots = ((data ?? []) as { slot_time: string }[]).map((r) => r.slot_time.slice(0, 5));
    return NextResponse.json(slots, { headers: NO_STORE });
  }

  const { data, error } = await anon().rpc('reschedule_days_by_token', { p_token: params.token });
  if (error) {
    console.error('reschedule_days_by_token', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los días' }, { status: 500 });
  }
  type Row = { day: string; status: string; slots: number; label: string | null };
  const days = ((data ?? []) as Row[]).map((d) => ({ date: d.day, status: d.status, slots: d.slots, label: d.label }));
  return NextResponse.json(days, { headers: NO_STORE });
}

const MESSAGES: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Cita no encontrada.' },
  locked: { status: 409, error: 'Esta cita ya no se puede cambiar desde aquí (ya pasó el plazo o no está activa). Comunícate con la barbería.' },
  limit: { status: 409, error: 'Ya cambiaste esta cita el máximo de veces permitido. Comunícate con la barbería.' },
  out_of_range: { status: 400, error: 'Esa fecha está fuera de las fechas disponibles.' },
  slot_unavailable: { status: 409, error: 'Ese horario acaba de ocuparse. Elige otro.' },
};

/** Mover la cita: { date: "AAAA-MM-DD", time: "HH:MM" }. Conserva la cita actual hasta guardar la nueva. */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  if (!rateLimit(`resched:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }
  if (!UUID_RE.test(params.token)) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  const time = typeof body?.time === 'string' ? body.time : '';
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    return NextResponse.json({ error: 'Elige un día y una hora.' }, { status: 400 });
  }

  const { data, error } = await anon().rpc('reschedule_by_token', { p_token: params.token, p_date: date, p_time: time });
  if (error) {
    console.error('reschedule_by_token', error.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
  if (data !== 'ok') {
    const m = MESSAGES[String(data)] ?? { status: 409, error: 'No se pudo cambiar la cita.' };
    return NextResponse.json({ error: m.error, code: data }, { status: m.status });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
