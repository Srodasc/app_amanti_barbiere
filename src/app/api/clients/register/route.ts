import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { name, phone, email, password } = await request.json();

    if (!name || !phone || !password) {
      return NextResponse.json(
        { error: 'Nombre, teléfono y contraseña son requeridos' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 4 caracteres' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verificar si el cliente ya existe
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existingClient) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con este teléfono' },
        { status: 400 }
      );
    }

    // Verificar si ya existe con ese email
    if (email) {
      const { data: existingByEmail } = await supabase
        .from('clients')
        .select('id')
        .eq('email', email)
        .single();

      if (existingByEmail) {
        return NextResponse.json(
          { error: 'Ya existe una cuenta con este correo electrónico' },
          { status: 400 }
        );
      }
    }

    // Crear nuevo cliente con contraseña
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name,
        phone,
        email: email || null,
        password_hash: password,
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

    return NextResponse.json({
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
