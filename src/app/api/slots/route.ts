import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DATE_RE, UUID_RE, clientIp, rateLimit } from '@/lib/rate-limit';
import { noStoreFetch } from '@/lib/supabase/no-store';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Horarios libres calculados en la base de datos (horario del barbero, descansos,
 * excepciones, bloqueos y citas existentes). Sin barbero = "cualquiera".
 */
export async function GET(request: Request) {
  if (!rateLimit(`slots:${clientIp(request)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Espera un momento.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service') ?? '';
  const date = searchParams.get('date') ?? '';
  const barber = searchParams.get('barber');

  if (!UUID_RE.test(service) || !DATE_RE.test(date) || (barber && !UUID_RE.test(barber))) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
  );

  const { data, error } = await supabase.rpc('get_available_slots', {
    p_service: service,
    p_date: date,
    p_barber: barber || null,
  });

  if (error) {
    console.error('get_available_slots', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los horarios' }, { status: 500 });
  }

  const slots = (data ?? []).map((s: { slot_time: string; barber_id: string }) => ({
    time: s.slot_time.slice(0, 5),
    barber_id: s.barber_id,
  }));

  return NextResponse.json(slots, { headers: NO_STORE });
}
