import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UUID_RE } from '@/lib/rate-limit';

/**
 * Crea (o actualiza la contraseña de) el acceso de un barbero para entrar a /mi-dia.
 * Solo un administrador activo puede llamarla. Usa la service role en servidor.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('auth_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

  let body: { barber_id?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const barberId = String(body.barber_id ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!UUID_RE.test(barberId)) return NextResponse.json({ error: 'Barbero inválido' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: barber } = await db.from('barbers').select('id, name, auth_id').eq('id', barberId).maybeSingle();
  if (!barber) return NextResponse.json({ error: 'Barbero no encontrado' }, { status: 404 });

  // Ya tiene acceso: solo se actualiza correo y contraseña
  if (barber.auth_id) {
    const { error } = await db.auth.admin.updateUserById(barber.auth_id, { email, password, email_confirm: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: true });
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: barber.name },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? 'No se pudo crear el acceso' }, { status: 400 });
  }

  const { error: linkError } = await db.from('barbers').update({ auth_id: created.user.id }).eq('id', barberId);
  if (linkError) {
    await db.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: false }, { status: 201 });
}
