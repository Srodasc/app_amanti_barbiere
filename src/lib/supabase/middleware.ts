import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protección de rutas por rol:
 *   /dashboard/*  → solo administradores activos (admin_users)
 *   /mi-dia       → barberos con acceso (barbers.auth_id) o administradores
 *   /login        → si ya hay sesión, redirige según el rol
 * Todo lo demás (/, /book, /cita/*, /api/*) es público.
 * Esta es la primera barrera; las políticas RLS de la base de datos son la que decide de verdad.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const needsAuth = pathname.startsWith('/dashboard') || pathname.startsWith('/mi-dia');
  if (!needsAuth && pathname !== '/login') return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // getUser() valida el token contra Supabase (getSession() no es confiable en servidor).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirige conservando las cookies de sesión recién refrescadas
  const redirectTo = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  async function roleOf(userId: string): Promise<'admin' | 'barber' | null> {
    const { data: admin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('auth_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (admin) return 'admin';

    const { data: barber } = await supabase
      .from('barbers')
      .select('id')
      .eq('auth_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    return barber ? 'barber' : null;
  }

  if (pathname === '/login') {
    if (!user) return response;
    const role = await roleOf(user.id);
    if (role === 'admin') return redirectTo('/dashboard');
    if (role === 'barber') return redirectTo('/mi-dia');
    return response;
  }

  if (!user) return redirectTo('/login');

  const role = await roleOf(user.id);
  if (!role) return redirectTo('/login?error=sin_acceso');

  if (pathname.startsWith('/dashboard') && role !== 'admin') return redirectTo('/mi-dia');

  return response;
}
