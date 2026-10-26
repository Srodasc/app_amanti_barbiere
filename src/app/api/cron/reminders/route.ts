import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp, type NotificationKind } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 3;
const BATCH = 40;

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Row = {
  id: string;
  kind: NotificationKind;
  attempts: number;
  appointment: One<{
    date: string;
    start_time: string;
    status: string;
    cancel_token: string;
    barber: One<{ name: string }>;
    service: One<{ name: string }>;
    client: One<{ name: string; phone: string; whatsapp_opt_in: boolean }>;
  }>;
};

/**
 * Procesa la cola de WhatsApp. Se invoca cada ~5 min (Supabase pg_cron + pg_net,
 * o Vercel Cron). Protegida con `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();

  const { data, error } = await db
    .from('notifications')
    .select(
      `id, kind, attempts,
       appointment:appointments(
         date, start_time, status, cancel_token,
         barber:barbers(name),
         service:services(name),
         client:clients(name, phone, whatsapp_opt_in)
       )`
    )
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for')
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = { reviewed: 0, sent: 0, skipped: 0, errors: 0, contended: 0 };
  const now = Date.now();

  for (const n of (data ?? []) as unknown as Row[]) {
    summary.reviewed++;

    const skip = async (why: string) => {
      await db.from('notifications').update({ status: 'skipped', last_error: why }).eq('id', n.id);
      summary.skipped++;
    };

    const apt = one(n.appointment);
    const client = one(apt?.client ?? null);
    const barber = one(apt?.barber ?? null);
    const service = one(apt?.service ?? null);

    if (!apt || !client || !service) {
      await skip('datos incompletos');
      continue;
    }

    const active = apt.status === 'pending' || apt.status === 'confirmed';
    const future = new Date(`${apt.date}T${apt.start_time.slice(0, 5)}:00-05:00`).getTime() > now;

    if (n.kind !== 'cancellation' && !(active && future)) {
      await skip('la cita ya no está vigente');
      continue;
    }
    if (!client.whatsapp_opt_in || client.phone === 'mostrador') {
      await skip('cliente sin WhatsApp');
      continue;
    }

    // Reclamo atómico: si otra ejecución ya tomó la fila, attempts habrá cambiado.
    const { data: claimed } = await db
      .from('notifications')
      .update({ attempts: n.attempts + 1 })
      .eq('id', n.id)
      .eq('status', 'pending')
      .eq('attempts', n.attempts)
      .select('id');

    if (!claimed?.length) {
      summary.contended++;
      continue;
    }

    const result = await sendWhatsApp({
      kind: n.kind,
      phone: client.phone,
      clientName: client.name,
      serviceName: service.name,
      barberName: barber?.name ?? 'nuestro equipo',
      date: apt.date,
      startTime: apt.start_time,
      cancelToken: apt.cancel_token,
    });

    if (result.ok) {
      await db
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', n.id);
      summary.sent++;
    } else {
      const exhausted = n.attempts + 1 >= MAX_ATTEMPTS;
      await db
        .from('notifications')
        .update({ status: exhausted ? 'error' : 'pending', last_error: result.error })
        .eq('id', n.id);
      summary.errors++;
    }
  }

  return NextResponse.json(summary);
}
