import 'server-only';

export type NotificationKind = 'confirmation' | 'reminder_24h' | 'reminder_2h' | 'cancellation';

export type MessageData = {
  kind: NotificationKind;
  phone: string; // cualquier formato; se normaliza
  clientName: string;
  serviceName: string;
  barberName: string;
  date: string; // YYYY-MM-DD (hora local de Colombia)
  startTime: string; // HH:MM[:SS]
  cancelToken: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

/** Celular colombiano de 10 dígitos que empieza por 3 → 57 + número. */
export function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  return /^3\d{9}$/.test(d) ? `57${d}` : d;
}

function whenText(date: string, time: string) {
  // Colombia no tiene horario de verano: siempre UTC-5.
  const d = new Date(`${date}T${time.slice(0, 5)}:00-05:00`);
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Plantillas (se crean y aprueban en Meta, categoría Utility):
 *   confirmation / reminder → {{1}} cliente, {{2}} servicio, {{3}} barbero, {{4}} fecha y hora, {{5}} enlace
 *   cancellation            → {{1}} cliente, {{2}} servicio, {{3}} fecha y hora
 */
function build(d: MessageData): { template: string; params: string[] } {
  const when = whenText(d.date, d.startTime);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  if (d.kind === 'cancellation') {
    return {
      template: process.env.WHATSAPP_TPL_CANCELACION ?? 'cita_cancelada',
      params: [d.clientName, d.serviceName, when],
    };
  }
  return {
    template:
      d.kind === 'confirmation'
        ? (process.env.WHATSAPP_TPL_CONFIRMACION ?? 'cita_confirmada')
        : (process.env.WHATSAPP_TPL_RECORDATORIO ?? 'cita_recordatorio'),
    params: [d.clientName, d.serviceName, d.barberName, when, `${site}/cita/${d.cancelToken}`],
  };
}

export async function sendWhatsApp(d: MessageData): Promise<SendResult> {
  const { template, params } = build(d);
  const to = normalizePhone(d.phone);

  if (process.env.WHATSAPP_DRY_RUN === 'true') {
    console.log(`[whatsapp:dry-run] ***${to.slice(-4)} ${template}`, params);
    return { ok: true };
  }

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return { ok: false, error: 'WhatsApp no está configurado' };

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'es' },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}
