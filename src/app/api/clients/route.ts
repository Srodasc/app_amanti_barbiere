import { createClient as createPublicClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const publicSupabase = createPublicClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const { name, email, phone, password } = await request.json();

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Nombre y teléfono son requeridos' },
        { status: 400 }
      );
    }

    // Verificar si el cliente ya existe por teléfono
    const { data: existingClient } = await publicSupabase
      .from('clients')
      .select('*')
      .eq('phone', phone)
      .single();

    if (existingClient) {
      return NextResponse.json(
        { error: 'Ya existe un cliente con este teléfono. Inicia sesión o usa otro teléfono.' },
        { status: 400 }
      );
    }

    // Crear nuevo cliente con contraseña
    const { data, error } = await publicSupabase
      .from('clients')
      .insert({
        name,
        email: email || null,
        phone,
        password_hash: password || null,
        is_verified: false,
      })
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (phone) {
      const { data } = await publicSupabase
        .from('clients')
        .select('*')
        .eq('phone', phone)
        .single();
      return NextResponse.json(data);
    }

    const { data } = await publicSupabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}