// Tipos y textos compartidos de fidelización.
import { formatCurrency } from '@/lib/utils';

export type RewardType = 'free' | 'percent' | 'amount';

export type LoyaltyRule = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  visits_required: number;
  reward_type: RewardType;
  reward_value: number;
  service_id: string | null;
  service?: { name: string } | { name: string }[] | null;
};

export type LoyaltyBalance = {
  client_id: string;
  rule_id: string;
  visits: number;
  rewards_available: number;
};

export const REWARD_TYPES: Record<RewardType, string> = {
  free: 'Servicio gratis',
  percent: 'Porcentaje de descuento',
  amount: 'Valor fijo de descuento',
};

export const EVENT_KINDS: Record<string, string> = {
  visit: 'Visita sumada',
  visit_reverted: 'Visita restada',
  reward_earned: 'Premio ganado',
  reward_redeemed: 'Premio usado',
  reward_returned: 'Premio devuelto',
  manual: 'Ajuste manual',
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** "Corte gratis", "20% de descuento", "$ 5.000 de descuento" */
export function rewardText(r: Pick<LoyaltyRule, 'reward_type' | 'reward_value'> & { service?: LoyaltyRule['service'] }) {
  const svc = one(r.service)?.name;
  if (r.reward_type === 'free') return svc ? `${svc} gratis` : 'Servicio gratis';
  if (r.reward_type === 'percent') return `${Number(r.reward_value)}% de descuento${svc ? ` en ${svc}` : ''}`;
  return `${formatCurrency(Number(r.reward_value))} de descuento${svc ? ` en ${svc}` : ''}`;
}

/** "Cada 10 visitas de Corte" / "Cada 5 visitas (cualquier servicio)" */
export function ruleConditionText(r: Pick<LoyaltyRule, 'visits_required'> & { service?: LoyaltyRule['service'] }) {
  const svc = one(r.service)?.name;
  return `Cada ${r.visits_required} visitas ${svc ? `de ${svc}` : '(cualquier servicio)'}`;
}

/** ¿La regla aplica a una cita de este servicio? */
export const ruleAppliesTo = (r: Pick<LoyaltyRule, 'service_id'>, serviceId: string | null | undefined) =>
  !r.service_id || r.service_id === serviceId;

export function loyaltyErrorMessage(err: { message?: string } | null | undefined): string {
  const m = err?.message ?? '';
  if (m.includes('no_rewards_available')) return 'El cliente ya no tiene premios disponibles de esa regla.';
  if (m.includes('reward_already_applied')) return 'Esta cita ya tiene un premio aplicado.';
  if (m.includes('rule_not_applicable')) return 'Ese premio no aplica para este servicio.';
  if (m.includes('appointment_locked')) return 'La cita ya está completada o cancelada; no se puede cambiar el premio.';
  if (m.includes('no_reward_applied')) return 'Esta cita no tiene premio aplicado.';
  if (m.includes('visits_over_limit')) return 'Las visitas deben ser menos que las requeridas (si completó, súmale un premio).';
  if (m.includes('note_required')) return 'Escribe el motivo del ajuste.';
  if (m.includes('invalid_quantity')) return 'Revisa los números (0 o más).';
  if (m.includes('loyalty_rules_reward_valid')) return 'Revisa el premio: el porcentaje va de 1 a 100 y el valor debe ser mayor que 0.';
  if (m.includes('loyalty_rules_name_len')) return 'El nombre debe tener entre 2 y 80 caracteres.';
  if (m.includes('not_authorized')) return 'No tienes permiso para esta acción.';
  return m || 'Ocurrió un error inesperado.';
}
