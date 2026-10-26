'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { PAYMENT_LABELS, money } from '@/lib/appointments';

type Closing = {
  day: string;
  opening_cash: number;
  services_cash: number;
  products_cash: number;
  expenses_cash: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  withdrawn: number;
  card_total: number;
  transfer_total: number;
  other_total: number;
  notes: string | null;
  closed_at: string;
};
type Summary = {
  day: string;
  services: Record<string, number>;
  products: Record<string, number>;
  services_count: number;
  products_count: number;
  expenses_cash: number;
  cash_expenses: { concept: string; amount: number }[];
  suggested_opening: number;
  previous_day: string | null;
  closing: Closing | null;
};

const METHODS = ['cash', 'card', 'transfer', 'other'] as const;
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (v: string) => Number(v.replace(/[^\d]/g, '') || 0);

/** Cierre de caja diario (administrador): esperado vs contado, por medio de pago. */
export default function CashPage() {
  const { showToast } = useToast();
  const [day, setDay] = useState(ymd(new Date()));
  const [s, setS] = useState<Summary | null>(null);
  const [history, setHistory] = useState<Closing[]>([]);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [withdrawn, setWithdrawn] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const isToday = day === ymd(new Date());

  const load = useCallback(async () => {
    const db = createClient();
    const [{ data, error }, { data: h }] = await Promise.all([
      db.rpc('cash_day_summary', { p_day: day }),
      db.from('cash_closings').select('*').order('day', { ascending: false }).limit(14),
    ]);
    if (error) {
      setError(error.message.includes('cash_day_summary') ? 'Falta ejecutar la migración de caja en Supabase.' : error.message);
      setS(null);
      return;
    }
    setError('');
    const sum = data as Summary;
    setS(sum);
    setHistory((h ?? []) as Closing[]);
    const c = sum.closing;
    setOpening(String(Math.round(Number(c ? c.opening_cash : sum.suggested_opening))));
    setCounted(c ? String(Math.round(Number(c.counted_cash))) : '');
    setWithdrawn(c ? String(Math.round(Number(c.withdrawn))) : '');
    setNotes(c?.notes ?? '');
    setEditing(!c);
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    if (!s) return null;
    const by = (m: string) => Number(s.services[m] ?? 0) + Number(s.products[m] ?? 0);
    const servicesCash = Number(s.services.cash ?? 0);
    const productsCash = Number(s.products.cash ?? 0);
    const expected = num(opening) + servicesCash + productsCash - Number(s.expenses_cash);
    const all = METHODS.reduce((t, m) => t + by(m), 0);
    return { by, servicesCash, productsCash, expected, all };
  }, [s, opening]);

  const diff = counted === '' || !totals ? null : num(counted) - totals.expected;

  const close = async () => {
    if (counted === '') return showToast('Escribe el efectivo contado.', 'error');
    if (num(withdrawn) > num(counted)) return showToast('El retiro no puede ser mayor que el efectivo contado.', 'error');
    setSaving(true);
    const { error } = await createClient().rpc('close_cash_day', {
      p_day: day,
      p_opening: num(opening),
      p_counted: num(counted),
      p_withdrawn: num(withdrawn),
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return showToast(error.message.includes('future_day') ? 'No se puede cerrar un día futuro.' : error.message, 'error');
    showToast('Caja cerrada', 'success');
    load();
  };

  const moneyInput = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-surface-500 bg-white focus-within:border-primary">
        <span className="pl-3 text-inverse/60" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          inputMode="numeric"
          disabled={!editing}
          value={value === '' ? '' : Number(num(value)).toLocaleString('es-CO')}
          onChange={(e) => set(e.target.value === '' ? '' : String(num(e.target.value)))}
          className="flex-1 min-w-0 h-11 px-2 bg-transparent focus:outline-none disabled:text-inverse/70"
        />
      </div>
      {hint && <p className="text-xs text-inverse/60 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse">Caja</h1>
          <p className="text-sm text-inverse/70">Cierre del día: lo que debería haber en efectivo contra lo que hay.</p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-surface-300 p-1">
          <button type="button" aria-label="Día anterior" onClick={() => setDay(ymd(addDays(parseISO(day), -1)))} className="p-2 rounded hover:bg-surface-container-low">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <input
            type="date"
            aria-label="Día"
            value={day}
            max={ymd(new Date())}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="h-9 px-2 rounded border border-surface-300 text-sm"
          />
          <button
            type="button"
            aria-label="Día siguiente"
            disabled={isToday}
            onClick={() => setDay(ymd(addDays(parseISO(day), 1)))}
            className="p-2 rounded hover:bg-surface-container-low disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {s && totals && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-surface-300 p-4">
              <h2 className="font-heading font-bold text-lg mb-1">{cap(format(parseISO(day), "EEEE d 'de' MMMM", { locale: es }))}</h2>
              <p className="text-sm text-inverse/70 mb-4">
                {s.services_count} servicios cobrados · {s.products_count} ventas de productos · Total {money(totals.all)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-inverse/70 border-b border-surface-300">
                      <th className="py-2 font-semibold">Medio de pago</th>
                      <th className="py-2 font-semibold text-right">Servicios</th>
                      <th className="py-2 font-semibold text-right">Productos</th>
                      <th className="py-2 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHODS.map((m) => (
                      <tr key={m} className={cn('border-b border-surface-200', m === 'cash' && 'font-semibold')}>
                        <td className="py-2">{PAYMENT_LABELS[m]}</td>
                        <td className="py-2 text-right tabular-nums">{money(s.services[m] ?? 0)}</td>
                        <td className="py-2 text-right tabular-nums">{money(s.products[m] ?? 0)}</td>
                        <td className="py-2 text-right tabular-nums">{money(totals.by(m))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-4">
              <h2 className="font-semibold mb-2">Gastos pagados con efectivo de la caja</h2>
              {s.cash_expenses.length === 0 ? (
                <p className="text-sm text-inverse/70">Ninguno. Al registrar un gasto marca «Pagado con efectivo de la caja» para que se descuente aquí.</p>
              ) : (
                <ul className="text-sm divide-y divide-surface-200">
                  {s.cash_expenses.map((e, i) => (
                    <li key={i} className="flex justify-between py-1.5">
                      <span>{e.concept}</span>
                      <span className="tabular-nums">{money(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {history.length > 0 && (
              <div className="bg-white rounded-xl border border-surface-300 p-4">
                <h2 className="font-semibold mb-2">Cierres recientes</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-inverse/70 border-b border-surface-300">
                        <th className="py-2 font-semibold">Día</th>
                        <th className="py-2 font-semibold text-right">Esperado</th>
                        <th className="py-2 font-semibold text-right">Contado</th>
                        <th className="py-2 font-semibold text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.day} className="border-b border-surface-200 cursor-pointer hover:bg-surface" onClick={() => setDay(h.day)}>
                          <td className="py-2">{cap(format(parseISO(h.day), 'EEE d MMM', { locale: es }))}</td>
                          <td className="py-2 text-right tabular-nums">{money(h.expected_cash)}</td>
                          <td className="py-2 text-right tabular-nums">{money(h.counted_cash)}</td>
                          <td className={cn('py-2 text-right tabular-nums font-semibold', Number(h.difference) < 0 ? 'text-error' : Number(h.difference) > 0 ? 'text-warning' : 'text-success')}>
                            {Number(h.difference) > 0 ? '+' : ''}
                            {money(h.difference)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Cierre */}
          <aside className="bg-white rounded-xl border border-surface-300 p-4 space-y-4 lg:sticky lg:top-4" aria-label="Cierre de caja">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" aria-hidden="true" />
              <h2 className="font-heading font-bold text-lg">Efectivo</h2>
              {s.closing && !editing && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-success bg-success/10 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Cerrada
                </span>
              )}
            </div>

            {moneyInput(
              'opening',
              'Base inicial',
              opening,
              setOpening,
              s.previous_day ? `Sugerida: lo que quedó en caja el ${format(parseISO(s.previous_day), "d 'de' MMM", { locale: es })}.` : undefined
            )}

            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <dt>+ Servicios en efectivo</dt>
                <dd className="tabular-nums">{money(totals.servicesCash)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>+ Productos en efectivo</dt>
                <dd className="tabular-nums">{money(totals.productsCash)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>− Gastos con caja</dt>
                <dd className="tabular-nums">{money(s.expenses_cash)}</dd>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-surface-300 pt-2">
                <dt>Debería haber</dt>
                <dd className="tabular-nums">{money(totals.expected)}</dd>
              </div>
            </dl>

            {moneyInput('counted', 'Efectivo contado', counted, setCounted)}

            {diff !== null && (
              <p
                role="status"
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold',
                  diff === 0 ? 'bg-success/10 text-success' : diff < 0 ? 'bg-error/10 text-error' : 'bg-warning/10 text-[#8a4100]'
                )}
              >
                {diff === 0 ? 'Cuadra exacto.' : diff < 0 ? `Faltan ${money(-diff)}.` : `Sobran ${money(diff)}.`}
              </p>
            )}

            {moneyInput('withdrawn', 'Retiro o consignación (opcional)', withdrawn, setWithdrawn, 'Lo que sale de la caja al cerrar. Lo que queda es la base de mañana.')}

            <div>
              <label htmlFor="notes" className="block text-sm font-semibold mb-1.5">
                Notas
              </label>
              <textarea
                id="notes"
                rows={2}
                disabled={!editing}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={diff && diff !== 0 ? 'Explica la diferencia' : ''}
                className="input-field resize-none"
              />
            </div>

            {editing ? (
              <Button onClick={close} isLoading={saving} className="w-full">
                {s.closing ? 'Guardar corrección' : 'Cerrar caja'}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setEditing(true)} className="w-full">
                Corregir cierre
              </Button>
            )}
            {s.closing && (
              <p className="text-xs text-inverse/60 text-center">
                Cerrada el {format(new Date(s.closing.closed_at), "d 'de' MMM, h:mm a", { locale: es })}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
