'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/products';

type Row = {
  id: string;
  total: number;
  payment_method: PaymentMethod;
  status: string;
  created_at: string;
  items: { quantity: number; product: { name: string } | { name: string }[] | null }[];
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** Ventas de hoy del barbero que tiene la sesión (RLS solo le muestra las suyas). */
export default function MySalesToday({ refreshKey, title = 'Mis ventas de hoy' }: { refreshKey: number; title?: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    createClient()
      .from('product_sales')
      .select('id, total, payment_method, status, created_at, items:product_sale_items(quantity, product:products(name))')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [refreshKey]);

  const total = rows.filter((r) => r.status === 'completed').reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex justify-between items-baseline mb-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="font-bold">{formatCurrency(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-inverse/60">Todavía no hay ventas de productos hoy.</p>
      ) : (
        <ul className="divide-y divide-surface-container-low text-sm">
          {rows.map((r) => (
            <li key={r.id} className={`py-2 ${r.status !== 'completed' ? 'opacity-50 line-through' : ''}`}>
              <div className="flex justify-between gap-2">
                <span className="truncate">{r.items.map((i) => `${i.quantity}× ${one(i.product)?.name ?? ''}`).join(', ')}</span>
                <span className="font-semibold shrink-0">{formatCurrency(Number(r.total))}</span>
              </div>
              <p className="text-xs text-inverse/50">
                {format(new Date(r.created_at), 'h:mm a')} · {PAYMENT_METHODS[r.payment_method]}
                {r.status !== 'completed' && ' · anulada'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
