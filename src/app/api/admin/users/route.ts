import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UUID_RE } from '@/lib/rate-limit';

/**
 * Gestión de administradores. Solo un DUEÑO (role = 'owner') activo puede usarla.
 *   GET   → lista de administradores y de barberos con acceso
 *   POST  → crear administrador (cuenta de acceso + fila en admin_users)
 *   PATCH → editar nombre/teléfono/rol/correo, cambiar contraseña, activar/desactivar
 * No hay DELETE a propósito: borrar un administrador borraría en cascada sus gastos,
 * servicios y citas. Se desactiva y se bloquea su inicio de sesión.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BAN_FOREVER = '876000h'; // ~100 años
type Role = 'owner' | 'manager';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail('No autenticado', 401) } as const;

  const db = createAdminClient();
  const { data: me } = await db
    .from('admin_users')
    .select('id, role')
    .eq('auth_id', user.id)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!me) return { error: fail('Sin permisos', 403) } as const;
  if (me.role !== 'owner') return { error: fail('Solo el dueño puede gestionar usuarios', 403) } as const;
  return { db, user, me } as const;
}

function dbError(message: string) {
  if (message.includes('last_owner')) return 'Debe quedar al menos un dueño activo.';
  if (message.includes('admin_users_auth_id_unique')) return 'Esa cuenta ya es administrador.';
  return message;
}

function authError(message: string) {
  if (/already been registered|already registered|exists/i.test(message)) {
    return 'Ese correo ya tiene una cuenta (puede ser de un barbero). Usa otro correo.';
  }
  if (/password/i.test(message)) return 'La contraseña no cumple los requisitos (mínimo 8 caracteres).';
  return message;
}

async function authInfo(db: ReturnType<typeof createAdminClient>, authId: string | null) {
  if (!authId) return null;
  const { data } = await db.auth.admin.getUserById(authId);
  const u = data?.user;
  if (!u) return null;
  const banned = Boolean(u.banned_until && new Date(u.banned_until) > new Date());
  return { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null, banned };
}

export async function GET() {
  const g = await requireOwner();
  if ('error' in g) return g.error;
  const { db, me } = g;

  const [{ data: admins, error }, { data: barbers }] = await Promise.all([
    db.from('admin_users').select('id, auth_id, name, email, phone, role, is_active, created_at').order('created_at'),
    db.from('barbers').select('id, name, auth_id, is_active').not('auth_id', 'is', null).order('name'),
  ]);
  if (error) return fail(error.message, 500);

  const adminRows = await Promise.all(
    (admins ?? []).map(async (a) => {
      const info = await authInfo(db, a.auth_id);
      return {
        id: a.id,
        name: a.name,
        email: info?.email ?? a.email,
        phone: a.phone,
        role: a.role as Role,
        is_active: a.is_active,
        created_at: a.created_at,
        last_sign_in_at: info?.last_sign_in_at ?? null,
        // Por fila (no por cuenta): si hay duplicados de tu cuenta, el sobrante se puede desactivar
        is_me: a.id === me.id,
        has_login: Boolean(info),
        login_blocked: info?.banned ?? false,
      };
    })
  );

  const barberRows = await Promise.all(
    (barbers ?? []).map(async (b) => {
      const info = await authInfo(db, b.auth_id);
      return { id: b.id, name: b.name, email: info?.email ?? null, is_active: b.is_active, last_sign_in_at: info?.last_sign_in_at ?? null };
    })
  );

  return NextResponse.json({ admins: adminRows, barbers: barberRows }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const g = await requireOwner();
  if ('error' in g) return g.error;
  const { db } = g;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Solicitud inválida');
  }
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;
  const role: Role = body.role === 'owner' ? 'owner' : 'manager';

  if (name.length < 2 || name.length > 80) return fail('Escribe el nombre (2 a 80 caracteres).');
  if (!EMAIL_RE.test(email)) return fail('Correo inválido.');
  if (password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');

  const { data: dup } = await db.from('admin_users').select('id').ilike('email', email).limit(1);
  if (dup?.length) return fail('Ya existe un administrador con ese correo.');

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (createError || !created.user) return fail(authError(createError?.message ?? 'No se pudo crear la cuenta'));

  const { data: row, error: insertError } = await db
    .from('admin_users')
    .insert({ auth_id: created.user.id, name, email, phone, role, is_active: true })
    .select('id')
    .single();
  if (insertError) {
    // Aún no tiene fila de administrador, así que borrar la cuenta no arrastra datos
    await db.auth.admin.deleteUser(created.user.id);
    return fail(dbError(insertError.message), 500);
  }

  return NextResponse.json({ ok: true, id: row.id }, { status: 201, headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const g = await requireOwner();
  if ('error' in g) return g.error;
  const { db, me } = g;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Solicitud inválida');
  }
  const id = String(body.id ?? '');
  if (!UUID_RE.test(id)) return fail('Usuario inválido.');

  const { data: target } = await db
    .from('admin_users')
    .select('id, auth_id, name, email, role, is_active')
    .eq('id', id)
    .maybeSingle();
  if (!target) return fail('Usuario no encontrado.', 404);
  const isMe = target.id === me.id;

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 80) return fail('Escribe el nombre (2 a 80 caracteres).');
    update.name = name;
  }
  if (body.phone !== undefined) update.phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;
  if (body.role !== undefined) {
    const role: Role = body.role === 'owner' ? 'owner' : 'manager';
    if (isMe && role !== target.role) return fail('No puedes cambiar tu propio rol. Pídeselo a otro dueño.');
    update.role = role;
  }
  if (body.is_active !== undefined) {
    const active = Boolean(body.is_active);
    if (isMe && !active) return fail('No puedes desactivar tu propia cuenta.');
    update.is_active = active;
  }

  let email: string | null = null;
  if (body.email !== undefined) {
    email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return fail('Correo inválido.');
    if (email === (target.email ?? '').toLowerCase()) email = null;
    else {
      const { data: dup } = await db.from('admin_users').select('id').ilike('email', email).neq('id', id).limit(1);
      if (dup?.length) return fail('Ya existe un administrador con ese correo.');
      update.email = email;
    }
  }
  const password = body.password ? String(body.password) : null;
  if (password !== null && password.length < 8) return fail('La contraseña debe tener al menos 8 caracteres.');
  if ((email || password) && !target.auth_id) return fail('Este administrador no tiene cuenta de acceso.');

  // Reactivar: primero se desbloquea el inicio de sesión
  if (update.is_active === true && target.auth_id) {
    const { error } = await db.auth.admin.updateUserById(target.auth_id, { ban_duration: 'none' });
    if (error) return fail(authError(error.message), 500);
  }

  // Correo / contraseña en la cuenta de acceso
  if (target.auth_id && (email || password)) {
    const { error } = await db.auth.admin.updateUserById(target.auth_id, {
      ...(email ? { email, email_confirm: true } : {}),
      ...(password ? { password } : {}),
    });
    if (error) return fail(authError(error.message));
  }

  // Fila de administrador (el trigger de la BD impide quedarse sin dueño activo)
  if (Object.keys(update).length > 0) {
    const { error } = await db.from('admin_users').update(update).eq('id', id);
    if (error) return fail(dbError(error.message));
  }

  // Desactivar: se bloquea el inicio de sesión. Aunque esto fallara, ya no es admin (is_active = false).
  let warning: string | undefined;
  if (update.is_active === false && target.auth_id) {
    // No se bloquea la cuenta si otra fila de administrador activa la usa (duplicado)
    // o si es la cuenta de un barbero activo (perdería /mi-dia).
    const [{ data: otherAdmin }, { data: asBarber }] = await Promise.all([
      db.from('admin_users').select('id').eq('auth_id', target.auth_id).eq('is_active', true).neq('id', id).limit(1),
      db.from('barbers').select('id').eq('auth_id', target.auth_id).eq('is_active', true).limit(1),
    ]);
    if (otherAdmin?.length) {
      warning = 'Se desactivó el registro duplicado. La cuenta sigue activa porque la usa otro administrador.';
    } else if (asBarber?.length) {
      warning = 'Ya no es administrador. Su cuenta sigue activa porque también es de un barbero (puede entrar a Mi día).';
    } else {
      const { error } = await db.auth.admin.updateUserById(target.auth_id, { ban_duration: BAN_FOREVER });
      if (error) warning = 'Quedó desactivado, pero no se pudo bloquear su inicio de sesión: ' + error.message;
    }
  }

  return NextResponse.json({ ok: true, warning }, { headers: NO_STORE });
}
