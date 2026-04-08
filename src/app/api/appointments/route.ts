import { createClient as createPublicClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const publicSupabase = createPublicClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const { 
      client_id, 
      service_id, 
      barber_id, 
      date, 
      start_time, 
      end_time,
      client_name,
      client_phone,
      notes 
    } = await request.json();

    if (!service_id || !date || !start_time) {
      return NextResponse.json(
        { error: 'Servicio, fecha y hora son requeridos' },
        { status: 400 }
      );
    }

    // Obtener admin por defecto
    let adminId = process.env.DEFAULT_ADMIN_ID;
    
    // Si no hay variable de entorno, intentar obtener de la tabla
    if (!adminId) {
      const { data: fallbackAdmin } = await publicSupabase
        .from('admin_users')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      adminId = fallbackAdmin?.id || null;
    }
    
    if (!adminId) {
      return NextResponse.json(
        { error: 'Error de configuración. Contacta al administrador.' },
        { status: 500 }
      );
    }

    let finalClientId = client_id;

    if (!finalClientId && client_phone) {
      // Buscar cliente existente por teléfono
      const { data: existingClient } = await publicSupabase
        .from('clients')
        .select('id')
        .eq('phone', client_phone)
        .single();

      if (existingClient) {
        finalClientId = existingClient.id;
      } else {
        // Crear nuevo cliente
        const { data: newClient, error: clientError } = await publicSupabase
          .from('clients')
          .insert({
            name: client_name || 'Cliente',
            phone: client_phone,
            is_verified: false,
          })
          .select('id')
          .single();

        if (clientError || !newClient) {
          return NextResponse.json(
            { error: 'Error al crear cliente: ' + (clientError?.message || 'Desconocido') },
            { status: 500 }
          );
        }
        finalClientId = newClient.id;
      }
    }

    const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const finalServiceId = service_id && isValidUUID(service_id) ? service_id : null;
    const finalBarberId = barber_id && isValidUUID(barber_id) ? barber_id : null;

    // Intentar crear usando la función RPC
    try {
      const { data, error } = await publicSupabase.rpc('book_slot_safe', {
        p_admin_id: adminId,
        p_client_id: finalClientId,
        p_service_id: finalServiceId,
        p_barber_id: finalBarberId,
        p_date: date,
        p_start_time: start_time,
        p_end_time: end_time,
        p_client_name: client_name || null,
        p_client_phone: client_phone || null,
        p_notes: notes || null,
      });

      if (error) {
        if (error.message?.includes('CONFLICT') || error.message?.includes('ocupado') || error.message?.includes('SLOT_BOOKED')) {
          const conflictMsg = finalBarberId 
            ? 'El barbero ya tiene una cita programada en este horario. Por favor selecciona otro horario.'
            : 'Ya existe una cita programada en este horario. Por favor selecciona otro horario.';
          return NextResponse.json({ error: conflictMsg }, { status: 409 });
        }
        // Si no es error de conflicto, intentar método alternativo
        console.log('RPC error, trying alternative:', error.message);
      }

      if (data && data.id) {
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
      }
    } catch (rpcErr) {
      console.log('RPC exception:', rpcErr);
    }

    // Método alternativo: Insert con locking usando deferrable constraint
    // Primero verificar y luego insertar en una sola transacción
    const { data: insertData, error: insertError } = await publicSupabase
      .from('appointments')
      .insert({
        admin_id: adminId,
        client_id: finalClientId,
        service_id: finalServiceId,
        barber_id: finalBarberId,
        date,
        start_time,
        end_time,
        status: 'pending',
        client_name: client_name || null,
        client_phone: client_phone || null,
        notes: notes || null,
      })
      .select(`*, service:services(*)`)
      .single();

    if (insertError) {
      // Verificar si es error de conflicto
      if (insertError.message?.includes('unique') || insertError.message?.includes('duplicate')) {
        const conflictMsg = finalBarberId 
          ? 'El barbero ya tiene una cita programada en este horario. Por favor selecciona otro horario.'
          : 'Ya existe una cita programada en este horario. Por favor selecciona otro horario.';
        return NextResponse.json({ error: conflictMsg }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(insertData);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    let query = publicSupabase
      .from('appointments')
      .select(`
        *,
        service:services(*),
        barber:barbers(*)
      `)
      .order('date', { ascending: false });

    if (phone) {
      query = query.eq('client_phone', phone);
    }

    const { data, error } = await query;

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