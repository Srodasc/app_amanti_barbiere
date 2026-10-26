'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LoyaltyBalance, LoyaltyRule } from '@/lib/loyalty';

/**
 * Carga en UNA consulta las reglas y los saldos de fidelización de varios clientes
 * (por ejemplo, los de las citas del día). RLS: el admin ve todo; el barbero, sus clientes.
 */
export function useLoyaltyForClients(clientIds: (string | null | undefined)[]) {
  const ids = useMemo(() => Array.from(new Set(clientIds.filter(Boolean) as string[])).sort(), [clientIds]);
  const key = ids.join(',');
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [balances, setBalances] = useState<LoyaltyBalance[]>([]);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase
        .from('loyalty_rules')
        .select('id, name, description, is_active, visits_required, reward_type, reward_value, service_id, service:services(name)'),
      ids.length
        ? supabase.from('loyalty_balances').select('client_id, rule_id, visits, rewards_available').in('client_id', ids)
        : Promise.resolve({ data: [] as LoyaltyBalance[] }),
    ]);
    setRules((r ?? []) as unknown as LoyaltyRule[]);
    setBalances((b ?? []) as LoyaltyBalance[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    reload();
  }, [reload]);

  const forClient = useCallback((clientId: string | null | undefined) => balances.filter((b) => b.client_id === clientId), [balances]);

  return { rules, balances, forClient, reload };
}
