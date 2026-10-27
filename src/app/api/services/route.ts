import { createClient as createPublicClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { noStoreFetch } from '@/lib/supabase/no-store';

export const dynamic = 'force-dynamic';

// Se crea en cada petición (no al cargar el módulo) para que el build no dependa de las variables de entorno.
const publicSupabase = () =>
  createPublicClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }, global: { fetch: noStoreFetch },
  });

export async function GET() {
  try {
    const { data, error } = await publicSupabase()
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Los adicionales no se agendan: solo se suman al cobrar la cita
    const bookable = (data ?? []).filter((s: { kind?: string }) => s.kind !== 'addon');
    return NextResponse.json(bookable, {
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
