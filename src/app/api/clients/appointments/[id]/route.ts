import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const clientId = cookieStore.get('client_session')?.value;

    if (!clientId) {
      return NextResponse.json(
        { error: 'No hay sesión activa' },
        { status: 401 }
      );
    }

    const { appointmentId, status } = await request.json();

    if (!appointmentId || !status) {
      return NextResponse.json(
        { error: 'ID de cita y estado son requeridos' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Verificar que la cita pertenece al cliente
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('id, client_id')
      .eq('id', appointmentId)
      .single();

    if (fetchError || !appointment) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      );
    }

    if (appointment.client_id !== clientId) {
      return NextResponse.json(
        { error: 'No tienes permiso para modificar esta cita' },
        { status: 403 }
      );
    }

    // Actualizar estado
    const { data, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
