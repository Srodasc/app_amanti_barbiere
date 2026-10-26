import { createClient as createPublicClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Se crea en cada petición (no al cargar el módulo) para que el build no dependa de las variables de entorno.
const publicSupabase = () =>
  createPublicClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const barberId = params.id;

    const { data, error } = await publicSupabase()
      .from('barber_schedules')
      .select('*')
      .eq('barber_id', barberId)
      .order('day_of_week');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}