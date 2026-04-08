import { createClient as createPublicClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const publicSupabase = createPublicClient(supabaseUrl, supabaseAnonKey);

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const barberId = params.id;

    const { data, error } = await publicSupabase
      .from('barber_schedules')
      .select('*')
      .eq('barber_id', barberId)
      .order('day_of_week');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}