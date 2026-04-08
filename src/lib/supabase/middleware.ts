import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Verificar cookie de sesión de cliente
  const clientSession = request.cookies.get('client_session')?.value;

  // Rutas públicas siempre permitidas
  if (pathname === '/' || pathname.startsWith('/book') || pathname.startsWith('/api')) {
    return response;
  }

  // Login y registro de admin - permitir si NO hay sesión activa
  if (pathname === '/login' || pathname === '/register') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // Dashboard requiere usuario admin
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // Portal de cliente requiere sesión de cliente
  if (pathname === '/client-portal') {
    if (!clientSession) {
      return NextResponse.redirect(new URL('/client-login', request.url));
    }
    return response;
  }

  // Login y registro de cliente - permitir acceso
  if (pathname === '/client-login' || pathname === '/register-client') {
    return response;
  }

  // Default: permitir
  return response;
}
