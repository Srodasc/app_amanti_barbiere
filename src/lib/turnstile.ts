import 'server-only';

/**
 * Verificación del captcha (Cloudflare Turnstile) en el servidor.
 *
 * Solo se exige cuando están configuradas LAS DOS claves:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (la usa el navegador para mostrar el widget)
 *   TURNSTILE_SECRET_KEY            (solo servidor)
 * Si falta alguna, la reserva funciona sin captcha (útil mientras lo configuras).
 * Exigirlo con una sola clave puesta bloquearía todas las reservas.
 */
export function captchaEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export type CaptchaResult = { ok: true } | { ok: false; reason: 'missing' | 'invalid' | 'unavailable' };

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyCaptcha(token: unknown, ip: string | null): Promise<CaptchaResult> {
  if (!captchaEnabled()) return { ok: true };
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: 'missing' };
  }

  const form = new URLSearchParams();
  form.set('secret', process.env.TURNSTILE_SECRET_KEY!);
  form.set('response', token);
  if (ip && ip !== 'unknown') form.set('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    const data = (await res.json()) as { success?: boolean; action?: string; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('turnstile rechazado', data['error-codes']);
      return { ok: false, reason: 'invalid' };
    }
    // El token debe venir del widget de reservas, no de otro formulario del sitio
    if (data.action && data.action !== 'reservar') return { ok: false, reason: 'invalid' };
    return { ok: true };
  } catch (e) {
    // Si Cloudflare no responde, se rechaza (falla cerrado) en vez de dejar pasar a todos
    console.error('turnstile no disponible', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'unavailable' };
  }
}
