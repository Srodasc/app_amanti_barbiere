'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, Package, Plus, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PAYMENT_LABELS, appointmentErrorMessage, money, time12 } from '@/lib/appointments';

type Target = {
  id: string;
  clientName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  price: number; // precio de la cita (ya con premio, si lo hay)
  barberName: string | null;
  startTime: string;
  hasReward?: boolean;
};
type Extra = { id: string; name: string; price: number };
type Product = { id: string; name: string; sale_price: number; stock: number };

/**
 * Completar y cobrar: registra el COBRO de la cita (precio + adicionales) y, si el
 * cliente llevó productos, la venta en el mismo paso y con el mismo medio de pago.
 * No crea ningún gasto.
 */
export default function CompleteAppointmentModal({
  target,
  onClose,
  onDone,
}: {
  target: Target | null;
  onClose: () => void;
  onDone: (total: number) => void;
}) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');
  const [received, setReceived] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setPicked([]);
    setCart({});
    setQuery('');
    setMethod('cash');
    setReceived(null);
    setError('');
    createClient()
      .from('services')
      .select('id, name, price')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setExtras(((data ?? []) as Extra[]).filter((s) => s.id !== target.serviceId)));
    createClient()
      .from('products')
      .select('id, name, sale_price, stock')
      .eq('is_active', true)
      .gt('stock', 0)
      .order('name')
      .then(({ data }) => setProducts((data ?? []) as Product[]));
  }, [target]);

  const extrasTotal = useMemo(
    () => extras.filter((e) => picked.includes(e.id)).reduce((s, e) => s + Number(e.price), 0),
    [extras, picked]
  );
  const cartLines = products.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id] }));
  const productsTotal = cartLines.reduce((s, p) => s + p.qty * Number(p.sale_price), 0);
  const total = (target?.price ?? 0) + extrasTotal + productsTotal;
  const setQty = (p: Product, qty: number) =>
    setCart((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[p.id];
      else n[p.id] = Math.min(qty, p.stock);
      return n;
    });
  const q = query.trim().toLowerCase();
  const shown = products.filter((p) => !cart[p.id] && (!q || p.name.toLowerCase().includes(q))).slice(0, q ? 12 : 8);
  // "Exacto" + billetes o montos redondos que alcancen para pagar (para calcular el cambio)
  const roundUp = (step: number) => Math.ceil(total / step) * step;
  const bills = Array.from(new Set([total, 20000, 50000, 100000, roundUp(50000), roundUp(100000)].filter((v) => v >= total)))
    .sort((a, b) => a - b)
    .slice(0, 4);
  const paidWith = received ?? total;

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    const db = createClient();
    // Con productos: cita + venta en una sola operación (si algo falla, no se guarda nada)
    const { data, error } = cartLines.length
      ? await db.rpc('complete_appointment_with_products', {
          p_appointment: target.id,
          p_payment: method,
          p_extras: picked,
          p_products: cartLines.map((p) => ({ product_id: p.id, quantity: p.qty })),
        })
      : await db.rpc('complete_appointment', { p_appointment: target.id, p_payment: method, p_extras: picked });
    setSaving(false);
    if (error) {
      const m = error.message ?? '';
      if (m.includes('complete_appointment_with_products')) return setError('Falta ejecutar la migración de cobro con productos en Supabase.');
      if (m.includes('insufficient_stock')) return setError(`No hay suficiente stock${error.details ? `: ${error.details}` : ''}. Ajusta la cantidad.`);
      if (m.includes('product_unavailable')) return setError('Uno de los productos ya no está disponible.');
      return setError(appointmentErrorMessage(error));
    }
    const paid = cartLines.length ? Number((data as { total?: number } | null)?.total ?? total) : Number(data ?? total);
    onDone(paid);
  };

  const pill = (on: boolean) =>
    cn(
      'min-h-[44px] px-4 rounded-full border text-sm font-semibold transition-colors',
      on ? 'bg-primary text-white border-primary' : 'bg-white text-inverse border-surface-500 hover:border-primary'
    );

  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title="Completar y cobrar"
      size="md"
      footer={
        target && (
          <div className="space-y-2">
            {error && (
              <p role="alert" className="text-sm text-error font-semibold">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="button" onClick={submit} isLoading={saving} className="flex-[2] whitespace-nowrap">
                Cobrar {money(total)}
              </Button>
            </div>
          </div>
        )
      }
    >
      {target && (
        <div className="space-y-5">
          <p className="text-sm text-inverse/70 -mt-2">
            {target.clientName ?? 'Cliente'} · {time12(target.startTime)}
            {target.barberName ? ` con ${target.barberName}` : ''}
          </p>

          <div className="rounded-xl border border-surface-300 bg-surface p-4 space-y-2 text-[15px]">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 break-words">
                {target.serviceName ?? 'Servicio'}
                {target.hasReward && <span className="ml-2 text-xs font-semibold text-primary">(premio aplicado)</span>}
              </span>
              <strong className="shrink-0 whitespace-nowrap">{money(target.price)}</strong>
            </div>
            {extras
              .filter((e) => picked.includes(e.id))
              .map((e) => (
                <div key={e.id} className="flex justify-between gap-3 text-primary-700">
                  <span className="min-w-0 break-words">+ {e.name}</span>
                  <strong className="shrink-0 whitespace-nowrap">{money(e.price)}</strong>
                </div>
              ))}
            {cartLines.map((p) => (
              <div key={p.id} className="flex justify-between gap-3 text-primary-700">
                <span className="min-w-0 break-words">
                  + {p.name}
                  {p.qty > 1 && ` ×${p.qty}`}
                </span>
                <strong className="shrink-0 whitespace-nowrap">{money(p.qty * Number(p.sale_price))}</strong>
              </div>
            ))}
            <div className="h-px bg-surface-300 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-bold">{money(total)}</span>
            </div>
          </div>

          {extras.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold">¿Agregó algo más?</p>
              <div className="flex flex-wrap gap-2">
                {extras.map((e) => {
                  const on = picked.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))}
                      className={pill(on)}
                    >
                      {e.name} +{money(e.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {products.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold flex items-center gap-1.5">
                <Package className="w-4 h-4" aria-hidden="true" /> ¿Llevó productos?
              </p>
              {cartLines.length > 0 && (
                <ul className="space-y-1.5">
                  {cartLines.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5">
                      <span className="flex-1 min-w-0 text-sm font-semibold leading-tight line-clamp-2 break-words">{p.name}</span>
                      <button type="button" onClick={() => setQty(p, p.qty - 1)} aria-label={`Quitar uno de ${p.name}`} className="w-9 h-9 rounded-lg bg-white border border-surface-400 flex items-center justify-center">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-bold tabular-nums" aria-live="polite">{p.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(p, p.qty + 1)}
                        disabled={p.qty >= p.stock}
                        aria-label={`Agregar otro ${p.name}`}
                        className="w-9 h-9 rounded-lg bg-white border border-surface-400 flex items-center justify-center disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setQty(p, 0)} aria-label={`Quitar ${p.name}`} className="w-8 h-9 flex items-center justify-center text-inverse/60 hover:text-error">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {products.length > 8 && (
                <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-surface-500 bg-white focus-within:border-primary">
                  <Search className="w-4 h-4 text-inverse/50" aria-hidden="true" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none" />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {shown.map((p) => (
                  <button key={p.id} type="button" onClick={() => setQty(p, 1)} className={pill(false)}>
                    {p.name} +{money(p.sale_price)}
                  </button>
                ))}
                {q && shown.length === 0 && <p className="text-sm text-inverse/60">Sin resultados con stock.</p>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-bold">Medio de pago</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Medio de pago">
              {(Object.keys(PAYMENT_LABELS) as (keyof typeof PAYMENT_LABELS)[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={method === k}
                  onClick={() => setMethod(k as typeof method)}
                  className={cn(
                    'h-12 rounded-lg border text-sm font-bold',
                    method === k ? 'bg-primary text-white border-primary' : 'bg-white text-inverse border-surface-500 hover:border-primary'
                  )}
                >
                  {PAYMENT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {method === 'cash' && total > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">Recibe</span>
              {bills.map((b) => (
                <button key={b} type="button" aria-pressed={paidWith === b} onClick={() => setReceived(b)} className={pill(paidWith === b)}>
                  {b === total ? 'Exacto' : money(b)}
                </button>
              ))}
              <span className="ml-auto text-[15px]">
                Cambio: <strong>{money(Math.max(0, paidWith - total))}</strong>
              </span>
            </div>
          )}

          <p className="text-xs text-inverse/60">
            Se registra como <strong className="text-success">ingreso</strong> de la cita (no se crea ningún gasto) y suma la visita de fidelización.
            {cartLines.length > 0 && ' Los productos se descuentan del inventario y quedan como venta del barbero, con el mismo medio de pago.'}
          </p>

        </div>
      )}
    </Modal>
  );
}
