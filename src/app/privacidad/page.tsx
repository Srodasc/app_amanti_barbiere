import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/privacy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Política de datos personales · Amanti Barbiere' };

/*
 * Política de tratamiento de datos personales (Ley 1581 de 2012; contenido mínimo:
 * art. 13 del Decreto 1377 de 2013). Los datos del responsable salen de
 * Dashboard → Ajustes → Datos del negocio (tabla business_settings).
 */

const KEYS = ['business_name', 'legal_name', 'legal_id', 'business_address', 'business_city', 'privacy_email', 'business_phone', 'privacy_policy_date'];

async function loadSettings(): Promise<Record<string, string>> {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data } = await db.from('business_settings').select('key, value').in('key', KEYS);
    return Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  } catch {
    return {};
  }
}

export default async function PrivacidadPage() {
  const s = await loadSettings();
  const v = (k: string, fallback: string) => (s[k] && s[k].trim() ? s[k].trim() : fallback);
  const brand = v('business_name', 'Amanti Barbiere');
  const email = v('privacy_email', '[correo pendiente]');
  const since = s.privacy_policy_date?.trim() || CONSENT_VERSION;

  const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="font-heading text-xl font-bold mt-8 mb-3">{children}</h2>;

  return (
    <div className="min-h-screen bg-surface text-inverse">
      <header className="bg-white border-b border-surface-300">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="font-heading font-bold text-lg text-inverse no-underline">{brand}</Link>
          <Link href="/book" className="text-sm font-semibold text-primary">Reservar</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 leading-relaxed text-[15px]">
        <h1 className="font-heading text-3xl font-bold mb-2">Política de tratamiento de datos personales</h1>
        <p className="text-sm text-inverse-50">Vigente desde el {since}. Cumple la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).</p>

        <H2>1. Quién es responsable de tus datos</H2>
        <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 bg-white border border-surface-300 rounded-xl p-4">
          <dt className="font-semibold">Responsable</dt>
          <dd>{v('legal_name', brand)}</dd>
          <dt className="font-semibold">NIT o cédula</dt>
          <dd>{v('legal_id', '[pendiente]')}</dd>
          <dt className="font-semibold">Dirección</dt>
          <dd>{[v('business_address', '[pendiente]'), s.business_city?.trim()].filter(Boolean).join(', ')}</dd>
          <dt className="font-semibold">Correo para datos personales</dt>
          <dd>{s.privacy_email?.trim() ? <a href={`mailto:${email}`} className="text-primary underline">{email}</a> : email}</dd>
          <dt className="font-semibold">Teléfono / WhatsApp</dt>
          <dd>{v('business_phone', '[pendiente]')}</dd>
        </dl>

        <H2>2. Qué datos recogemos y para qué</H2>
        <p>Solo pedimos lo necesario para atender tu cita: nombre y celular. No pedimos correo, documento de identidad ni datos sensibles (salud, origen, creencias).</p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li><strong>Nombre:</strong> identificarte en la agenda.</li>
          <li><strong>Celular:</strong> identificarte como cliente, enviarte por WhatsApp la confirmación, recordatorios y cambios de tu cita, y sumar tus visitas al programa de premios.</li>
          <li><strong>Citas</strong> (fecha, servicio, barbero, precio, estado): organizar la agenda, cobrar, llevar la contabilidad y calcular tus premios.</li>
          <li><strong>Notas que escribas:</strong> atenderte como prefieres.</li>
          <li><strong>Compras de productos:</strong> facturación, inventario y contabilidad.</li>
        </ul>
        <p className="mt-3">
          Los mensajes de tu cita (confirmación, recordatorio, cancelación) son informativos porque los pediste al reservar. Solo te enviaremos
          promociones si lo aceptas aparte; podrás dejar de recibirlas cuando quieras, y llegarán únicamente de lunes a viernes de 7:00 a. m. a
          7:00 p. m. y sábados de 8:00 a. m. a 3:00 p. m., nunca domingos ni festivos (Ley 2300 de 2023). Puedes pedir que no te escribamos por
          WhatsApp y seguir reservando.
        </p>

        <H2>3. Tus derechos</H2>
        <ul className="list-disc pl-6 space-y-1.5">
          <li>Conocer, actualizar y corregir tus datos.</li>
          <li>Pedir prueba de la autorización que diste.</li>
          <li>Saber para qué se han usado tus datos.</li>
          <li>Revocar la autorización o pedir que borremos tus datos, salvo los que la ley obliga a conservar (por ejemplo, facturas).</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de hacer la consulta o el reclamo con nosotros.</li>
        </ul>
        <p className="mt-3">Ejercerlos es gratis.</p>

        <H2>4. Cómo hacer una consulta o un reclamo</H2>
        <p>
          Escribe a <strong>{email}</strong> con tu nombre, tu celular, lo que pides y, si es un reclamo, los hechos y los documentos que quieras
          aportar.
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li><strong>Consulta</strong> (saber qué datos tuyos tenemos): respondemos en máximo 10 días hábiles; si no alcanzamos, te avisamos el motivo y respondemos en máximo 5 días hábiles más.</li>
          <li><strong>Reclamo</strong> (corregir, actualizar o borrar datos, o revocar la autorización): respondemos en máximo 15 días hábiles desde el día siguiente a recibirlo; si no alcanzamos, te avisamos el motivo y respondemos en máximo 8 días hábiles más.</li>
          <li>Si al reclamo le falta información, te la pedimos en los 5 días siguientes; si pasan 2 meses sin respuesta, se entiende que desististe. Mientras se resuelve, tu registro queda marcado como “reclamo en trámite”.</li>
        </ul>

        <H2>5. Seguridad y proveedores</H2>
        <p>
          Tus datos se guardan en servicios en la nube con acceso restringido: solo el personal autorizado los ve y cada barbero solo ve los de sus
          propios clientes. Usamos proveedores que tratan datos por cuenta nuestra, algunos fuera de Colombia, con quienes existen acuerdos de
          protección de datos:
        </p>
        <ul className="list-disc pl-6 mt-3 space-y-1.5">
          <li><strong>Supabase:</strong> base de datos de la aplicación.</li>
          <li><strong>Vercel:</strong> alojamiento de la página web.</li>
          <li><strong>Meta (WhatsApp Business):</strong> envío de confirmaciones y recordatorios.</li>
          <li><strong>Cloudflare (Turnstile):</strong> verificación contra reservas automatizadas (datos técnicos del navegador y dirección IP).</li>
        </ul>

        <H2>6. Cuánto tiempo guardamos tus datos</H2>
        <p>
          Mientras seas cliente. Si pasan 2 años sin citas, los borramos o anonimizamos, salvo la información contable y de facturación, que se
          conserva el tiempo que exige la ley.
        </p>

        <H2>7. Autorización</H2>
        <p>Al reservar marcas una casilla con este texto (la guardamos con la fecha y la versión como prueba):</p>
        <blockquote className="mt-3 border-l-4 border-primary-200 bg-white rounded-r-lg p-4 italic">{CONSENT_TEXT}</blockquote>
        <p className="mt-3 text-sm text-inverse-50">Versión del texto: {CONSENT_VERSION}.</p>

        <H2>8. Cambios a esta política</H2>
        <p>Si la cambiamos de forma importante, lo avisaremos antes de aplicar los cambios y te pediremos de nuevo la autorización en tu próxima reserva.</p>
      </main>
    </div>
  );
}
