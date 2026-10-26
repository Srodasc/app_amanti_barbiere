import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UUID_RE, clientIp, rateLimit } from '@/lib/rate-limit';
import { noStoreFetch } from '@/lib/supabase/no-store';

const NO_STORE = { 'Cache-Control': 'no-store' };

function anon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
  );
}

/** Ver una cita con su enlace privado (el token es el "permiso"). */
export async function GET(request: Request, { params }: { params: { token: string } }) {
  if (!rateLimit(`cita:${clientIp(request)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas consultas' }, { status: 429 });
  }
  if (!UUID_RE.test(params.token)) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }

  const db = anon();
  const [{ data, error }, { data: loyalty }, { data: resched }] = await Promise.all([
    db.rpc('get_appointment_by_token', { p_token: params.token }),
    // Avance de fidelización del cliente (si la migración aún no está, simplemente no se muestra)
    db.rpc('get_loyalty_by_token', { p_token: params.token }),
    // ¿Se puede reprogramar? (si la migración de la Fase 3 aún no está, no se ofrece)
    db.rpc('reschedule_info_by_token', { p_token: params.token }),
  ]);
  if (error) {
    console.error('get_appointment_by_token', error.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });

  const r = Array.isArray(resched) ? resched[0] : resched;
  return NextResponse.json(
    {
      ...row,
      loyalty: Array.isArray(loyalty) ? loyalty : [],
      can_reschedule: !!r?.can_reschedule,
      reschedules_left: r?.reschedules_left ?? 0,
      duration_minutes: r?.duration_minutes ?? null,
      deadline_hours: r?.deadline_hours ?? null,
    },
    { headers: NO_STORE }
  );
}

/** Cancelar con el enlace privado, respetando el plazo configurado. */
export async function DELETE(request: Request, { params }: { params: { token: string } }) {
  if (!rateLimit(`cancel:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }
  if (!UUID_RE.test(params.token)) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }

  const { data, error } = await anon().rpc('cancel_appointment_by_token', { p_token: params.token });
  if (error) {
    console.error('cancel_appointment_by_token', error.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Esta cita ya no se puede cancelar desde aquí (ya pasó el plazo o ya estaba cancelada). Comunícate con la barbería.' },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
