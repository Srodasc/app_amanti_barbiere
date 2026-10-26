'use client';

import { useEffect, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/appointments';

type Row = { barber_id: string; commission: number; pending: number; commission_pct: number };

/** Mi día: lo que el barbero lleva ganado hoy y en la semana (sus comisiones). */
export default function MyCommissions({ barberId, refreshKey }: { barberId: string; refreshKey: number }) {
  const [data, setData] = useState<{ today: number; week: number; pending: number; pct: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const monday = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const db = createClient();
    Promise.all([
      db.rpc('commission_summary', { p_from: today, p_to: today }),
      db.rpc('commission_summary', { p_from: monday, p_to: today }),
      db.rpc('commission_summary', { p_from: '2000-01-01', p_to: today }),
    ]).then(([d, w, all]) => {
      if (d.error || w.error || all.error) return setData(null); // sin migración: no se muestra
      const mine = (x: { data: unknown }) => ((x.data ?? []) as Row[]).find((r) => r.barber_id === barberId);
      const t = mine(d);
      if (!t || Number(t.commission_pct) === 0) return setData(null); // sin porcentaje configurado
      setData({ today: +t.commission, week: +(mine(w)?.commission ?? 0), pending: +(mine(all)?.pending ?? 0), pct: +t.commission_pct });
    });
  }, [barberId, refreshKey]);

  if (!data) return null;
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
      <p className="text-sm font-semibold text-inverse/70 mb-2">Tus comisiones ({data.pct}%)</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-inverse/70">Hoy</p>
          <p className="font-bold">{money(data.today)}</p>
        </div>
        <div>
          <p className="text-xs text-inverse/70">Esta semana</p>
          <p className="font-bold">{money(data.week)}</p>
        </div>
        <div>
          <p className="text-xs text-inverse/70">Por cobrar</p>
          <p className="font-bold text-primary">{money(data.pending)}</p>
        </div>
      </div>
    </div>
  );
}
