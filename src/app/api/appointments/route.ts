import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DATE_RE, TIME_RE, UUID_RE, clientIp, rateLimit } from '@/lib/rate-limit';
import { verifyCaptcha } from '@/lib/turnstile';
import { CONSENT_VERSION } from '@/lib/privacy';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Códigos que lanza la función book_appointment() de la base de datos
const MENSAJES: Record<string, { text: string; status: number }> = {
  invalid_name: { text: 'Escribe tu nombre.', status: 400 },
  invalid_phone: { text: 'El número de celular no es válido.', status: 400 },
  service_unavailable: { text: 'Ese servicio ya no está disponible.', status: 400 },
  slot_unavailable: { text: 'Ese horario ya no está disponible. Elige otro.', status: 409 },
  booking_limit: { text: 'Ya tienes 3 citas activas. Cancela una para agendar otra.', status: 400 },
};

/**
 * Reserva pública. Toda la lógica (disponibilidad, cliente, anti doble reserva,
 * notificaciones) ocurre dentro de la función SQL book_appointment().
 * Ya NO existe GET: listar citas desde el navegador exponía datos de clientes.
 */
export async function POST(request: Request) {
  if (!rateLimit(`book:${clientIp(request)}`, 8, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Demasiados intentos. Intenta en unos minutos.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const service_id = String(body.service_id ?? '');
  const barber_id = body.barber_id ? String(body.barber_id) : null;
  const date = String(body.date ?? '');
  const time = String(body.start_time ?? '');
  const name = String(body.client_name ?? '').trim();
  const phone = String(body.client_phone ?? '').trim();
  const notes = body.notes ? String(body.notes).slice(0, 300) : null;

  if (
    !UUID_RE.test(service_id) ||
    (barber_id && !UUID_RE.test(barber_id)) ||
    !DATE_RE.test(date) ||
    !TIME_RE.test(time) ||
    name.length < 2 || name.length > 80 ||
    phone.length < 7 || phone.length > 20
  ) {
    return NextResponse.json({ error: 'Revisa los datos e inténtalo de nuevo.' }, { status: 400 });
  }

  // Autorización de tratamiento de datos: obligatoria (Ley 1581 de 2012; el silencio no cuenta)
  if (body.data_consent !== true) {
    return NextResponse.json({ error: 'Para reservar debes autorizar el uso de tus datos.', code: 'consent' }, { status: 400 });
  }

  // Captcha: después de validar el formato (barato) y antes de tocar la base de datos
  const captcha = await verifyCaptcha(body.captcha_token, clientIp(request));
  if (!captcha.ok) {
    const text =
      captcha.reason === 'unavailable'
        ? 'No pudimos verificar la reserva en este momento. Intenta de nuevo en un minuto.'
        : 'Confirma que no eres un robot e inténtalo de nuevo.';
    return NextResponse.json({ error: text, code: 'captcha' }, { status: 403, headers: NO_STORE });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.rpc('book_appointment', {
    p_service: service_id,
    p_date: date,
    p_time: time.slice(0, 5),
    p_barber: barber_id,
    p_name: name,
    p_phone: phone,
    p_notes: notes,
  });

  if (error) {
    const code = Object.keys(MENSAJES).find((c) => error.message.includes(c));
    if (code) {
      return NextResponse.json({ error: MENSAJES[code].text, code }, { status: MENSAJES[code].status, headers: NO_STORE });
    }
    console.error('book_appointment', error.message);
    return NextResponse.json({ error: 'No se pudo agendar. Intenta de nuevo.' }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;

  // Prueba de la autorización: fecha y versión del texto aceptado, guardadas en el cliente
  const { error: consentError } = await supabase.rpc('record_data_consent', {
    p_token: row.cancel_token,
    p_version: CONSENT_VERSION,
  });
  if (consentError) console.error('record_data_consent', consentError.message);
  return NextResponse.json(
    { id: row.appointment_id, cancel_token: row.cancel_token, barber_name: row.barber_name },
    { status: 201, headers: NO_STORE }
  );
}
