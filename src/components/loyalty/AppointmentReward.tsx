'use client';

import { useState } from 'react';
import { Gift, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import {
  loyaltyErrorMessage,
  rewardText,
  ruleAppliesTo,
  type LoyaltyBalance,
  type LoyaltyRule,
} from '@/lib/loyalty';

type Appt = {
  id: string;
  client_id: string | null;
  service_id: string | null;
  status: string;
  price?: number | null;
  reward_rule_id?: string | null;
};

/**
 * En una cita: muestra el premio aplicado (con opción de quitarlo) o los premios
 * disponibles del cliente para ese servicio, con botón para aplicarlo.
 * Lo usan el administrador (Citas) y el barbero (Mi día).
 */
export default function AppointmentReward({
  appointment,
  rules,
  balances,
  onChanged,
}: {
  appointment: Appt;
  rules: LoyaltyRule[];
  balances: LoyaltyBalance[]; // saldos de ESTE cliente
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = ['pending', 'confirmed', 'in_progress'].includes(appointment.status);

  const applied = appointment.reward_rule_id ? rules.find((r) => r.id === appointment.reward_rule_id) : null;

  const available = balances
    .filter((b) => b.rewards_available > 0)
    .map((b) => ({ balance: b, rule: rules.find((r) => r.id === b.rule_id) }))
    .filter((x): x is { balance: LoyaltyBalance; rule: LoyaltyRule } => !!x.rule && ruleAppliesTo(x.rule, appointment.service_id));

  const run = async (fn: 'apply_loyalty_reward' | 'remove_loyalty_reward', args: Record<string, string>) => {
    setBusy(true);
    setError('');
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    if (error) setError(loyaltyErrorMessage(error));
    else onChanged();
  };

  if (!appointment.client_id) return null;

  if (applied || appointment.reward_rule_id) {
    return (
      <div className="mt-2 text-sm rounded bg-success/10 text-success px-2 py-1.5 flex items-center gap-2">
        <Gift className="w-4 h-4 shrink-0" />
        <span className="flex-1">
          Premio aplicado: {applied ? rewardText(applied) : 'fidelización'}
          {appointment.price != null && <> · cobra <strong>{formatCurrency(Number(appointment.price))}</strong></>}
        </span>
        {editable && (
          <button
            type="button"
            title="Quitar premio"
            disabled={busy}
            onClick={() => run('remove_loyalty_reward', { p_appointment: appointment.id })}
            className="p-1 rounded hover:bg-white/60 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {error && <span className="text-error text-xs">{error}</span>}
      </div>
    );
  }

  if (!editable || available.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {available.map(({ balance, rule }) => (
        <div key={rule.id} className="text-sm rounded bg-primary/10 px-2 py-1.5 flex items-center gap-2">
          <Gift className="w-4 h-4 text-primary shrink-0" />
          <span className="flex-1">
            Tiene premio: <strong>{rewardText(rule)}</strong>
            {balance.rewards_available > 1 && ` (×${balance.rewards_available})`}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('apply_loyalty_reward', { p_appointment: appointment.id, p_rule: rule.id })}
            className="text-xs font-semibold px-2 py-1 rounded bg-primary text-white disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      ))}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
