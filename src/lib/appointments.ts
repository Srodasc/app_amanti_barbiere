// Textos y utilidades compartidas de citas.
import { formatCurrency } from '@/lib/utils';

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

export const SOURCE_LABELS: Record<string, string> = {
  web: 'Reserva web',
  staff: 'Panel',
  walk_in: 'Mostrador',
  admin: 'Panel',
};

/** "16:30" → "4:30 p. m." */
export function time12(t: string | null | undefined) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Enlace para escribir por WhatsApp a un celular guardado (573001234567) */
export const whatsappLink = (phone: string | null | undefined) =>
  phone && /^\d{10,15}$/.test(phone) ? `https://wa.me/${phone}` : null;

/** Ingreso real de una cita: lo cobrado si ya se cobró; si no, su precio */
export const appointmentRevenue = (a: { paid_amount?: number | null; price?: number | null; service?: { price: number } | null }) =>
  Number(a.paid_amount ?? a.price ?? a.service?.price ?? 0);

export const money = (n: number | null | undefined) => formatCurrency(Number(n ?? 0));

export function appointmentErrorMessage(err: { message?: string } | null | undefined) {
  const m = err?.message ?? '';
  if (m.includes('use_complete_appointment')) return 'Usa "Completar y cobrar" para registrar el pago.';
  if (m.includes('appointment_locked')) return 'La cita ya está completada o cancelada.';
  if (m.includes('invalid_payment')) return 'Elige el medio de pago.';
  if (m.includes('slot_unavailable') || m.includes('appointments_no_overlap')) return 'Ese barbero ya tiene una cita a esa hora.';
  if (m.includes('not_authorized')) return 'No tienes permiso para esta acción.';
  return m || 'Ocurrió un error inesperado.';
}
