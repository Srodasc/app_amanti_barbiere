import { createClient as createPublicClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const publicSupabase = createPublicClient(supabaseUrl, supabaseAnonKey);

export async function PATCH(request: Request) {
  try {
    const { clientId, newPassword } = await request.json();

    if (!clientId || !newPassword) {
      return NextResponse.json(
        { error: 'ID de cliente y nueva contraseña son requeridos' },
        { status: 400 }
      );
    }

    if (newPassword.length < 4) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 4 caracteres' },
        { status: 400 }
      );
    }

    const { error } = await publicSupabase
      .from('clients')
      .update({ password_hash: newPassword })
      .eq('id', clientId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}