'use client';

import { useCallback, useEffect, useState } from 'react';
import { endOfMonth, format, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Gift, Settings2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { money } from '@/lib/appointments';

type Row = {
  barber_id: string;
  barber_name: string;
  commission_pct: number;
  services: number;
  sales: number;
  base: number;
  commission: number;
  paid: number;
  pending: number;
};
type Detail = {
  appointment_id: string;
  paid_on: string;
  client_name: string | null;
  service_name: string | null;
  extras: string | null;
  paid_amount: number;
  base: number;
  commission: number;
  rewarded: boolean;
  payout_id: string | null;
};
type Payout = {
  id: string;
  barber_id: string;
  period_from: string;
  period_to: string;
  appointments: number;
  amount: number;
  paid_from_cash: boolean;
  notes: string | null;
  created_at: string;
  barber: { name: string } | { name: string }[] | null;
};

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const short = (d: string) => format(parseISO(d), "d 'de' MMM", { locale: es });
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

function presets() {
  const now = new Date();
  const wk = { weekStartsOn: 1 as const };
  return [
    { key: 'week', label: 'Esta semana', from: ymd(startOfWeek(now, wk)), to: ymd(now) },
    { key: 'lastweek', label: 'Semana pasada', from: ymd(startOfWeek(subWeeks(now, 1), wk)), to: ymd(endOfWeek(subWeeks(now, 1), wk)) },
    { key: 'month', label: 'Este mes', from: ymd(startOfMonth(now)), to: ymd(now) },
    { key: 'lastmonth', label: 'Mes pasado', from: ymd(startOfMonth(subMonths(now, 1))), to: ymd(endOfMonth(subMonths(now, 1))) },
  ];
}

/** Comisiones de barberos: cuánto ganó cada uno en el periodo y liquidación (pago). */
export default function CommissionsPage() {
  const { showToast } = useToast();
  const [from, setFrom] = useState(presets()[0].from);
  const [to, setTo] = useState(presets()[0].to);
  const [rows, setRows] = useState<Row[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail[] | null>(null);
  const [toPay, setToPay] = useState<Row | null>(null);
  const [fromCash, setFromCash] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(false);
  const [toVoid, setToVoid] = useState<Payout | null>(null);

  const load = useCallback(async () => {
    const db = createClient();
    const [{ data, error }, { data: p }] = await Promise.all([
      db.rpc('commission_summary', { p_from: from, p_to: to }),
      db.from('commission_payouts').select('*, barber:barbers(name)').order('created_at', { ascending: false }).limit(20),
    ]);
    if (error) {
      setError(error.message.includes('commission_summary') ? 'Falta ejecutar la migración de comisiones en Supabase.' : error.message);
      return;
    }
    setError('');
    setRows(((data ?? []) as Row[]).map((r) => ({ ...r, sales: +r.sales, base: +r.base, commission: +r.commission, paid: +r.paid, pending: +r.pending })));
    setPayouts((p ?? []) as Payout[]);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return setDetail(null);
    setDetail(null);
    createClient()
      .rpc('commission_detail', { p_barber: selected, p_from: from, p_to: to })
      .then(({ data }) => setDetail((data ?? []) as Detail[]));
  }, [selected, from, to, rows]);

  const pay = async () => {
    if (!toPay) return;
    setBusy(true);
    const { error } = await createClient().rpc('pay_commissions', {
      p_barber: toPay.barber_id,
      p_from: from,
      p_to: to,
      p_from_cash: fromCash,
      p_notes: payNotes.trim() || null,
    });
    setBusy(false);
    if (error) return showToast(error.message.includes('nothing_to_pay') ? 'No hay comisiones pendientes en este periodo.' : error.message, 'error');
    showToast(`Liquidación registrada: ${money(toPay.pending)} (quedó como gasto de Nómina)`, 'success');
    setToPay(null);
    load();
  };

  const voidPayout = async () => {
    if (!toVoid) return;
    setBusy(true);
    const { error } = await createClient().rpc('void_commission_payout', { p_payout: toVoid.id });
    setBusy(false);
    if (error) return showToast(error.message, 'error');
    showToast('Liquidación anulada', 'success');
    setToVoid(null);
    load();
  };

  const totals = rows.reduce(
    (t, r) => ({ commission: t.commission + r.commission, pending: t.pending + r.pending, sales: t.sales + r.sales }),
    { commission: 0, pending: 0, sales: 0 }
  );
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.key;

  return (
    <div className="space-y-4 animate-fade-in max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse">Comisiones</h1>
          <p className="text-sm text-inverse/70">Lo que gana cada barbero por los servicios cobrados en el periodo.</p>
        </div>
        <Button variant="secondary" onClick={() => setConfig(true)}>
          <Settings2 className="w-4 h-4 mr-2" aria-hidden="true" /> Porcentajes
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-surface-300 p-2">
        {presets().map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activePreset === p.key}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
            className={cn(
              'px-3 min-h-[36px] rounded-lg text-sm font-semibold border',
              activePreset === p.key ? 'bg-inverse text-white border-inverse' : 'border-surface-300 hover:border-primary'
            )}
          >
            {p.label}
          </button>
        ))}
        <span className="flex items-center gap-1.5 text-sm ml-auto">
          <input type="date" aria-label="Desde" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 px-2 rounded border border-surface-300" />
          –
          <input type="date" aria-label="Hasta" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 px-2 rounded border border-surface-300" />
        </span>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Servicios cobrados" value={money(totals.sales)} />
        <Stat label="Comisiones del periodo" value={money(totals.commission)} />
        <Stat label="Por pagar" value={money(totals.pending)} strong={totals.pending > 0} />
      </div>

      <div className="bg-white rounded-xl border border-surface-300 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-inverse/70 border-b border-surface-300">
              <th className="px-4 py-3 font-semibold">Barbero</th>
              <th className="px-2 py-3 font-semibold text-right">%</th>
              <th className="px-2 py-3 font-semibold text-right">Servicios</th>
              <th className="px-2 py-3 font-semibold text-right">Cobrado</th>
              <th className="px-2 py-3 font-semibold text-right">Base comisión</th>
              <th className="px-2 py-3 font-semibold text-right">Comisión</th>
              <th className="px-2 py-3 font-semibold text-right">Pagado</th>
              <th className="px-2 py-3 font-semibold text-right">Pendiente</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.barber_id}
                className={cn('border-b border-surface-200 cursor-pointer hover:bg-surface', selected === r.barber_id && 'bg-primary-50')}
                onClick={() => setSelected(selected === r.barber_id ? null : r.barber_id)}
              >
                <td className="px-4 py-3 font-semibold">{r.barber_name}</td>
                <td className="px-2 py-3 text-right tabular-nums">{Number(r.commission_pct)}%</td>
                <td className="px-2 py-3 text-right tabular-nums">{r.services}</td>
                <td className="px-2 py-3 text-right tabular-nums">{money(r.sales)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{money(r.base)}</td>
                <td className="px-2 py-3 text-right tabular-nums font-semibold">{money(r.commission)}</td>
                <td className="px-2 py-3 text-right tabular-nums text-success">{money(r.paid)}</td>
                <td className={cn('px-2 py-3 text-right tabular-nums font-bold', r.pending > 0 && 'text-primary-700')}>{money(r.pending)}</td>
                <td className="px-4 py-3 text-right">
                  {r.pending > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFromCash(false);
                        setPayNotes('');
                        setToPay(r);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-600"
                    >
                      Liquidar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-inverse/60">
                  No hay barberos activos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="font-semibold mb-3">
            Detalle de {rows.find((r) => r.barber_id === selected)?.barber_name} · {short(from)} – {short(to)}
          </h2>
          {detail === null ? (
            <p className="text-sm text-inverse/60">Cargando…</p>
          ) : detail.length === 0 ? (
            <p className="text-sm text-inverse/60">Sin servicios cobrados en el periodo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-inverse/70 border-b border-surface-300">
                    <th className="py-2 font-semibold">Fecha</th>
                    <th className="py-2 font-semibold">Cliente</th>
                    <th className="py-2 font-semibold">Servicio</th>
                    <th className="py-2 font-semibold text-right">Cobrado</th>
                    <th className="py-2 font-semibold text-right">Base</th>
                    <th className="py-2 font-semibold text-right">Comisión</th>
                    <th className="py-2 font-semibold text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((d) => (
                    <tr key={d.appointment_id} className="border-b border-surface-200">
                      <td className="py-2 whitespace-nowrap">{short(d.paid_on)}</td>
                      <td className="py-2">{d.client_name ?? 'Cliente'}</td>
                      <td className="py-2">
                        {d.service_name}
                        {d.extras && <span className="text-inverse/70"> + {d.extras}</span>}
                        {d.rewarded && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-primary-700" title="Usó un premio: la comisión es sobre el precio normal">
                            <Gift className="w-3 h-3" aria-hidden="true" /> premio
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{money(d.paid_amount)}</td>
                      <td className="py-2 text-right tabular-nums">{money(d.base)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{money(d.commission)}</td>
                      <td className={cn('py-2 text-right text-xs font-bold', d.payout_id ? 'text-success' : 'text-primary-700')}>{d.payout_id ? 'Pagada' : 'Pendiente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-inverse/60 mt-2">Si el cliente usó un premio, la comisión se calcula sobre el precio normal del servicio.</p>
        </div>
      )}

      {payouts.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <h2 className="font-semibold mb-3">Liquidaciones recientes</h2>
          <ul className="divide-y divide-surface-200 text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 min-w-0">
                  <span className="font-semibold">{one(p.barber)?.name}</span> · {short(p.period_from)} – {short(p.period_to)} · {p.appointments} servicios
                  {p.paid_from_cash && <span className="ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded bg-surface-200">Caja</span>}
                  <span className="block text-xs text-inverse/60">
                    Pagado el {format(new Date(p.created_at), "d 'de' MMM, h:mm a", { locale: es })}
                    {p.notes && ` · ${p.notes}`}
                  </span>
                </span>
                <span className="font-bold tabular-nums">{money(p.amount)}</span>
                <button type="button" onClick={() => setToVoid(p)} aria-label="Anular liquidación" className="p-2 text-inverse/60 hover:text-error rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal isOpen={!!toPay} onClose={() => setToPay(null)} title="Liquidar comisiones" size="sm">
        {toPay && (
          <div className="space-y-4">
            <p className="text-sm">
              Pagar a <strong>{toPay.barber_name}</strong> las comisiones pendientes del {short(from)} al {short(to)}:
            </p>
            <p className="text-3xl font-heading font-bold text-center">{money(toPay.pending)}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} className="w-4 h-4 accent-primary" />
              Pagado con efectivo de la caja
            </label>
            <div>
              <label htmlFor="pay-notes" className="block text-sm font-semibold mb-1.5">
                Notas (opcional)
              </label>
              <input id="pay-notes" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="input-field" placeholder="Ej: transferencia Nequi" />
            </div>
            <p className="text-xs text-inverse/70">Queda registrado como gasto de Nómina y estas citas se marcan como pagadas.</p>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setToPay(null)} className="flex-1">
                Volver
              </Button>
              <Button onClick={pay} isLoading={busy} className="flex-1">
                Registrar pago
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!toVoid} onClose={() => setToVoid(null)} title="Anular liquidación" size="sm">
        <p className="text-sm text-inverse/70 mb-6">
          Las comisiones vuelven a quedar pendientes y se borra el gasto de Nómina asociado. Úsalo solo si la liquidación se registró por error.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setToVoid(null)} className="flex-1">
            Volver
          </Button>
          <Button variant="danger" onClick={voidPayout} isLoading={busy} className="flex-1">
            Anular
          </Button>
        </div>
      </Modal>

      <CommissionConfig open={config} onClose={() => setConfig(false)} onSaved={load} />
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('bg-white rounded-xl border px-3 py-2.5', strong ? 'border-primary-200 bg-primary-50' : 'border-surface-300')}>
      <p className="text-xs font-semibold text-inverse/70">{label}</p>
      <p className="text-lg font-heading font-bold">{value}</p>
    </div>
  );
}

type Cfg = { id: string; name: string; commission_pct: number };
type Override = { barber_id: string; service_id: string; pct: number };

/** Porcentaje por barbero y excepciones por servicio. */
function CommissionConfig({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [barbers, setBarbers] = useState<Cfg[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<Record<string, { service: string; pct: string }>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = createClient();
    const [{ data: b }, { data: s }, { data: o }] = await Promise.all([
      db.from('barbers').select('id, name, commission_pct').eq('is_active', true).order('name'),
      db.from('services').select('id, name').eq('is_active', true).order('name'),
      db.from('barber_service_commissions').select('barber_id, service_id, pct'),
    ]);
    const list = (b ?? []) as Cfg[];
    setBarbers(list);
    setPcts(Object.fromEntries(list.map((x) => [x.id, String(Number(x.commission_pct ?? 0))])));
    setServices((s ?? []) as { id: string; name: string }[]);
    setOverrides((o ?? []) as Override[]);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const valid = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100;

  const saveAll = async () => {
    if (!Object.values(pcts).every(valid)) return showToast('Los porcentajes deben estar entre 0 y 100.', 'error');
    setSaving(true);
    const db = createClient();
    const changed = barbers.filter((b) => Number(pcts[b.id]) !== Number(b.commission_pct));
    for (const b of changed) {
      const { error } = await db.from('barbers').update({ commission_pct: Number(pcts[b.id]) }).eq('id', b.id);
      if (error) {
        setSaving(false);
        return showToast(error.message, 'error');
      }
    }
    setSaving(false);
    showToast('Porcentajes guardados. Aplican a las citas que se cobren desde ahora.', 'success');
    onSaved();
    onClose();
  };

  const addOverride = async (barberId: string) => {
    const a = adding[barberId];
    if (!a?.service || !valid(a.pct)) return showToast('Elige el servicio y un porcentaje entre 0 y 100.', 'error');
    const { error } = await createClient()
      .from('barber_service_commissions')
      .upsert({ barber_id: barberId, service_id: a.service, pct: Number(a.pct) }, { onConflict: 'barber_id,service_id' });
    if (error) return showToast(error.message, 'error');
    setAdding((x) => ({ ...x, [barberId]: { service: '', pct: '' } }));
    load();
  };

  const removeOverride = async (o: Override) => {
    const { error } = await createClient().from('barber_service_commissions').delete().eq('barber_id', o.barber_id).eq('service_id', o.service_id);
    if (error) return showToast(error.message, 'error');
    load();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Porcentajes de comisión" size="lg">
      <div className="space-y-5">
        <p className="text-sm text-inverse/70">
          Cada barbero gana su porcentaje sobre los servicios que cobra. Puedes poner un porcentaje distinto para servicios puntuales. Los cambios aplican a las citas que se
          cobren desde ahora.
        </p>
        {barbers.map((b) => {
          const own = overrides.filter((o) => o.barber_id === b.id);
          const add = adding[b.id] ?? { service: '', pct: '' };
          return (
            <div key={b.id} className="rounded-xl border border-surface-300 p-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-semibold flex-1">{b.name}</span>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="sr-only">Porcentaje de {b.name}</span>
                  <input
                    inputMode="decimal"
                    value={pcts[b.id] ?? ''}
                    onChange={(e) => setPcts((p) => ({ ...p, [b.id]: e.target.value.replace(',', '.') }))}
                    className={cn('w-20 h-10 px-2 rounded-lg border text-right', valid(pcts[b.id] ?? '') ? 'border-surface-500' : 'border-error')}
                  />
                  %
                </label>
              </div>
              {own.length > 0 && (
                <ul className="text-sm space-y-1">
                  {own.map((o) => (
                    <li key={o.service_id} className="flex items-center gap-2 pl-2">
                      <span className="flex-1">{services.find((s) => s.id === o.service_id)?.name ?? 'Servicio'}</span>
                      <span className="tabular-nums font-semibold">{Number(o.pct)}%</span>
                      <button type="button" onClick={() => removeOverride(o)} aria-label="Quitar excepción" className="p-1.5 text-inverse/60 hover:text-error">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  aria-label={`Servicio con porcentaje distinto para ${b.name}`}
                  value={add.service}
                  onChange={(e) => setAdding((x) => ({ ...x, [b.id]: { ...add, service: e.target.value } }))}
                  className="input-field !w-auto !py-1.5 flex-1 min-w-[160px]"
                >
                  <option value="">Porcentaje distinto para…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  aria-label="Porcentaje"
                  placeholder="%"
                  value={add.pct}
                  onChange={(e) => setAdding((x) => ({ ...x, [b.id]: { ...add, pct: e.target.value.replace(',', '.') } }))}
                  className="w-20 h-9 px-2 rounded-lg border border-surface-500 text-right"
                />
                <button type="button" onClick={() => addOverride(b.id)} className="px-3 h-9 rounded-lg border border-primary-200 text-primary-700 font-semibold hover:bg-primary-50">
                  Agregar
                </button>
              </div>
            </div>
          );
        })}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cerrar
          </Button>
          <Button onClick={saveAll} isLoading={saving} className="flex-1">
            Guardar porcentajes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
