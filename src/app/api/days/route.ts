import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { UUID_RE, clientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Días reservables desde hoy hasta max_days_ahead, calculados en la base de datos:
 * open (con horarios), full (sin cupos), holiday (día especial cerrado) o closed.
 */
export async function GET(request: Request) {
  if (!rateLimit(`days:${clientIp(request)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Espera un momento.' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service') ?? '';
  const barber = searchParams.get('barber');
  if (!UUID_RE.test(service) || (barber && !UUID_RE.test(barber))) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('get_available_days', { p_service: service, p_barber: barber || null });
  if (error) {
    console.error('get_available_days', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar los días' }, { status: 500 });
  }

  type Row = { day: string; status: string; slots: number; first_time: string | null; first_barber: string | null; label: string | null };
  const days = ((data ?? []) as Row[]).map((d) => ({
    date: d.day,
    status: d.status,
    slots: d.slots,
    first_time: d.first_time ? d.first_time.slice(0, 5) : null,
    first_barber: d.first_barber,
    label: d.label,
  }));
  return NextResponse.json(days, { headers: { 'Cache-Control': 'no-store' } });
}
