'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Edit2, Gift, Search, SlidersHorizontal, Users, History as HistoryIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Select, Modal, Card, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  EVENT_KINDS,
  REWARD_TYPES,
  loyaltyErrorMessage,
  rewardText,
  ruleConditionText,
  type LoyaltyBalance,
  type LoyaltyRule,
  type RewardType,
} from '@/lib/loyalty';

type Service = { id: string; name: string };
type ClientLite = { id: string; name: string; phone: string | null };
type BalanceRow = LoyaltyBalance & { client: ClientLite | ClientLite[] | null };
type EventRow = {
  id: string;
  kind: string;
  visits_delta: number;
  rewards_delta: number;
  note: string | null;
  created_at: string;
  client: ClientLite | ClientLite[] | null;
  rule: { name: string } | { name: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const when = (ts: string) => format(new Date(ts), "d MMM yyyy, h:mm a", { locale: es });
const RULE_SELECT = 'id, name, description, is_active, visits_required, reward_type, reward_value, service_id, service:services(name)';

const emptyRule = {
  name: '',
  description: '',
  visits_required: '10',
  reward_type: 'free' as RewardType,
  reward_value: '',
  service_id: '',
  is_active: true,
};

function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="h-2 rounded-full bg-surface-container-low overflow-hidden" aria-label={`${value} de ${max}`}>
      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function LoyaltyPage() {
  const supabase = () => createClient();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'reglas' | 'clientes' | 'historial'>('reglas');
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  // clientes
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientLite[]>([]);
  const [selected, setSelected] = useState<ClientLite | null>(null);
  const [clientBalances, setClientBalances] = useState<LoyaltyBalance[]>([]);
  const [clientEvents, setClientEvents] = useState<EventRow[]>([]);

  // modales
  const [editing, setEditing] = useState<LoyaltyRule | 'new' | null>(null);
  const [form, setForm] = useState(emptyRule);
  const [adjustRule, setAdjustRule] = useState<LoyaltyRule | null>(null);
  const [adjust, setAdjust] = useState({ visits: '0', rewards: '0', note: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadRules = useCallback(async () => {
    const [{ data: r, error }, { data: s }] = await Promise.all([
      supabase().from('loyalty_rules').select(RULE_SELECT).order('is_active', { ascending: false }).order('visits_required'),
      supabase().from('services').select('id, name').eq('is_active', true).order('name'),
    ]);
    if (error) showToast(loyaltyErrorMessage(error), 'error');
    setRules((r ?? []) as unknown as LoyaltyRule[]);
    setServices((s ?? []) as Service[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBalances = useCallback(async () => {
    const { data } = await supabase()
      .from('loyalty_balances')
      .select('client_id, rule_id, visits, rewards_available, client:clients(id, name, phone)');
    setBalances((data ?? []) as unknown as BalanceRow[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase()
      .from('loyalty_events')
      .select('id, kind, visits_delta, rewards_delta, note, created_at, client:clients(id, name, phone), rule:loyalty_rules(name)')
      .order('created_at', { ascending: false })
      .limit(150);
    setEvents((data ?? []) as unknown as EventRow[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadRules(), loadBalances()]);
      setLoading(false);
    })();
  }, [loadRules, loadBalances]);

  useEffect(() => {
    if (tab === 'historial') loadEvents();
  }, [tab, loadEvents]);

  // ---------- estadísticas por regla ----------
  const statsByRule = useMemo(() => {
    const m = new Map<string, { clients: number; pending: number }>();
    for (const b of balances) {
      const s = m.get(b.rule_id) ?? { clients: 0, pending: 0 };
      if (b.visits > 0 || b.rewards_available > 0) s.clients += 1;
      s.pending += b.rewards_available;
      m.set(b.rule_id, s);
    }
    return m;
  }, [balances]);

  const withRewards = useMemo(() => {
    const m = new Map<string, { client: ClientLite; total: number }>();
    for (const b of balances) {
      const c = one(b.client);
      if (!c || b.rewards_available <= 0) continue;
      const cur = m.get(c.id) ?? { client: c, total: 0 };
      cur.total += b.rewards_available;
      m.set(c.id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [balances]);

  // ---------- reglas ----------
  const openNew = () => {
    setForm(emptyRule);
    setFormError('');
    setEditing('new');
  };
  const openEdit = (r: LoyaltyRule) => {
    setForm({
      name: r.name,
      description: r.description ?? '',
      visits_required: String(r.visits_required),
      reward_type: r.reward_type,
      reward_value: r.reward_type === 'free' ? '' : String(Number(r.reward_value)),
      service_id: r.service_id ?? '',
      is_active: r.is_active,
    });
    setFormError('');
    setEditing(r);
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const visits = Number(form.visits_required);
    const value = form.reward_type === 'free' ? 0 : Number(form.reward_value);
    if (form.name.trim().length < 2) return setFormError('Escribe un nombre (ej: "Corte gratis").');
    if (!Number.isInteger(visits) || visits < 1 || visits > 100) return setFormError('Las visitas deben ser un número entero entre 1 y 100.');
    if (form.reward_type === 'percent' && !(value > 0 && value <= 100)) return setFormError('El porcentaje va de 1 a 100.');
    if (form.reward_type === 'amount' && !(value > 0)) return setFormError('Escribe el valor del descuento.');

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      visits_required: visits,
      reward_type: form.reward_type,
      reward_value: value,
      service_id: form.service_id || null,
      is_active: form.is_active,
    };
    setSaving(true);
    setFormError('');
    const { error } =
      editing === 'new'
        ? await supabase().from('loyalty_rules').insert(payload)
        : await supabase().from('loyalty_rules').update(payload).eq('id', (editing as LoyaltyRule).id);
    setSaving(false);
    if (error) return setFormError(loyaltyErrorMessage(error));
    showToast(editing === 'new' ? 'Regla creada' : 'Regla actualizada', 'success');
    setEditing(null);
    loadRules();
  };

  // ---------- clientes ----------
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const safe = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase()
        .from('clients')
        .select('id, name, phone')
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .neq('phone', 'mostrador')
        .order('name')
        .limit(15);
      setResults((data ?? []) as ClientLite[]);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openClient = async (c: ClientLite) => {
    setSelected(c);
    const [{ data: b }, { data: ev }] = await Promise.all([
      supabase().from('loyalty_balances').select('client_id, rule_id, visits, rewards_available').eq('client_id', c.id),
      supabase()
        .from('loyalty_events')
        .select('id, kind, visits_delta, rewards_delta, note, created_at, client:clients(id, name, phone), rule:loyalty_rules(name)')
        .eq('client_id', c.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setClientBalances((b ?? []) as LoyaltyBalance[]);
    setClientEvents((ev ?? []) as unknown as EventRow[]);
  };

  const openAdjust = (r: LoyaltyRule) => {
    const b = clientBalances.find((x) => x.rule_id === r.id);
    setAdjust({ visits: String(b?.visits ?? 0), rewards: String(b?.rewards_available ?? 0), note: '' });
    setFormError('');
    setAdjustRule(r);
  };

  const saveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !adjustRule) return;
    const v = Number(adjust.visits);
    const rw = Number(adjust.rewards);
    if (!Number.isInteger(v) || v < 0 || !Number.isInteger(rw) || rw < 0) return setFormError('Usa números enteros (0 o más).');
    if (v >= adjustRule.visits_required)
      return setFormError(`Las visitas deben ser menos de ${adjustRule.visits_required}. Si ya completó, súmale un premio.`);
    if (!adjust.note.trim()) return setFormError('Escribe el motivo (ej: "Tarjeta física con 4 sellos").');
    setSaving(true);
    const { error } = await supabase().rpc('adjust_loyalty_balance', {
      p_client: selected.id,
      p_rule: adjustRule.id,
      p_visits: v,
      p_rewards: rw,
      p_note: adjust.note.trim(),
    });
    setSaving(false);
    if (error) return setFormError(loyaltyErrorMessage(error));
    showToast('Saldo ajustado', 'success');
    setAdjustRule(null);
    await openClient(selected);
    loadBalances();
  };

  const activeRules = rules.filter((r) => r.is_active);
  // En el detalle del cliente: reglas activas + inactivas donde aún tenga algo
  const clientRules = rules.filter(
    (r) => r.is_active || clientBalances.some((b) => b.rule_id === r.id && (b.rewards_available > 0 || b.visits > 0))
  );

  const tabs = [
    { id: 'reglas', label: 'Reglas', icon: Gift },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'historial', label: 'Historial', icon: HistoryIcon },
  ] as const;

  const EventLine = ({ e, showClient }: { e: EventRow; showClient: boolean }) => (
    <li className="py-2 flex items-start gap-3 text-sm">
      <div className="flex-1 min-w-0">
        <p>
          <strong>{EVENT_KINDS[e.kind] ?? e.kind}</strong> · {one(e.rule)?.name ?? 'Regla'}
          {showClient && <> · {one(e.client)?.name ?? 'Cliente'}</>}
        </p>
        <p className="text-xs text-inverse/50">
          {when(e.created_at)}
          {e.note && ` · ${e.note}`}
        </p>
      </div>
      <div className="text-right text-xs shrink-0">
        {e.visits_delta !== 0 && <p>{e.visits_delta > 0 ? `+${e.visits_delta}` : e.visits_delta} visitas</p>}
        {e.rewards_delta !== 0 && (
          <p className={e.rewards_delta > 0 ? 'text-success' : 'text-inverse/70'}>
            {e.rewards_delta > 0 ? `+${e.rewards_delta}` : e.rewards_delta} premio
          </p>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Fidelización</h1>
          <p className="text-inverse/60">Premios para los clientes que vuelven</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Nueva regla
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="!p-4" hover={false}>
          <p className="text-sm text-inverse/60">Reglas activas</p>
          <p className="text-2xl font-bold mt-1">{activeRules.length}</p>
        </Card>
        <Card className="!p-4" hover={false}>
          <p className="text-sm text-inverse/60">Clientes participando</p>
          <p className="text-2xl font-bold mt-1">
            {new Set(balances.filter((b) => b.visits > 0 || b.rewards_available > 0).map((b) => b.client_id)).size}
          </p>
        </Card>
        <Card className="!p-4 cursor-pointer" hover={false} onClick={() => setTab('clientes')}>
          <p className="text-sm text-inverse/60">Premios por usar</p>
          <p className="text-2xl font-bold mt-1 text-primary">{balances.reduce((s, b) => s + b.rewards_available, 0)}</p>
        </Card>
      </div>

      <div className="flex gap-2 border-b border-surface-container-low">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-inverse/60 hover:text-inverse'
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'reglas' && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-inverse/60">Cargando...</p>
          ) : rules.length === 0 ? (
            <Card hover={false}>
              <p className="text-inverse/70">
                Aún no hay reglas. Crea la primera, por ejemplo <strong>“Cada 10 cortes, el siguiente gratis”</strong>.
              </p>
            </Card>
          ) : (
            rules.map((r) => {
              const st = statsByRule.get(r.id) ?? { clients: 0, pending: 0 };
              return (
                <Card key={r.id} hover={false} className={cn('!p-4', !r.is_active && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Gift className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold flex flex-wrap items-center gap-2">
                        {r.name} {!r.is_active && <Badge>Inactiva</Badge>}
                      </p>
                      <p className="text-sm text-inverse/70">
                        {ruleConditionText(r)} → <strong>{rewardText(r)}</strong>
                      </p>
                      {r.description && <p className="text-sm text-inverse/60 mt-1">{r.description}</p>}
                      <p className="text-xs text-inverse/50 mt-1">
                        {st.clients} clientes con avance · {st.pending} premios por usar
                      </p>
                    </div>
                    <button title="Editar" onClick={() => openEdit(r)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'clientes' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card hover={false} className="!p-0">
            <div className="p-4 border-b border-surface-container-low">
              <Input
                placeholder="Buscar cliente por nombre o celular"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                icon={<Search className="w-5 h-5" />}
              />
            </div>
            {query.trim().length >= 2 ? (
              results.length === 0 ? (
                <p className="p-4 text-sm text-inverse/60">Sin resultados.</p>
              ) : (
                <ul className="divide-y divide-surface-container-low">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => openClient(c)} className="w-full text-left p-4 hover:bg-surface">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-inverse/60">{c.phone}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <>
                <p className="px-4 pt-4 text-sm font-semibold">Clientes con premios por usar</p>
                {withRewards.length === 0 ? (
                  <p className="p-4 text-sm text-inverse/60">Nadie tiene premios pendientes todavía.</p>
                ) : (
                  <ul className="divide-y divide-surface-container-low">
                    {withRewards.map(({ client, total }) => (
                      <li key={client.id}>
                        <button onClick={() => openClient(client)} className="w-full text-left p-4 hover:bg-surface flex justify-between gap-2">
                          <span>
                            <span className="block font-medium">{client.name}</span>
                            <span className="block text-sm text-inverse/60">{client.phone}</span>
                          </span>
                          <Badge variant="accent">
                            {total} premio{total > 1 ? 's' : ''}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>

          <Card hover={false}>
            {!selected ? (
              <p className="text-sm text-inverse/60">
                Elige un cliente para ver su avance. Desde aquí puedes <strong>cargar los sellos que ya traía</strong> del programa anterior.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <p className="text-sm text-inverse/60">{selected.phone}</p>
                </div>
                {clientRules.length === 0 ? (
                  <p className="text-sm text-inverse/60">No hay reglas activas.</p>
                ) : (
                  <ul className="space-y-4">
                    {clientRules.map((r) => {
                      const b = clientBalances.find((x) => x.rule_id === r.id);
                      const visits = b?.visits ?? 0;
                      const rewards = b?.rewards_available ?? 0;
                      return (
                        <li key={r.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm">
                              {r.name} {!r.is_active && <Badge>Inactiva</Badge>}
                            </p>
                            <button onClick={() => openAdjust(r)} className="text-xs text-primary flex items-center gap-1">
                              <SlidersHorizontal className="w-3.5 h-3.5" /> Ajustar
                            </button>
                          </div>
                          <Progress value={visits} max={r.visits_required} />
                          <p className="text-xs text-inverse/60">
                            {visits} de {r.visits_required} visitas
                            {rewards > 0 && (
                              <strong className="text-primary"> · {rewards} premio{rewards > 1 ? 's' : ''} por usar ({rewardText(r)})</strong>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div>
                  <p className="text-sm font-semibold mb-1">Historial</p>
                  {clientEvents.length === 0 ? (
                    <p className="text-sm text-inverse/60">Sin movimientos.</p>
                  ) : (
                    <ul className="divide-y divide-surface-container-low max-h-80 overflow-y-auto">
                      {clientEvents.map((e) => <EventLine key={e.id} e={e} showClient={false} />)}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'historial' && (
        <Card hover={false}>
          {events.length === 0 ? (
            <p className="text-sm text-inverse/60">Aún no hay movimientos de fidelización.</p>
          ) : (
            <ul className="divide-y divide-surface-container-low">
              {events.map((e) => <EventLine key={e.id} e={e} showClient />)}
            </ul>
          )}
          <p className="text-xs text-inverse/50 mt-2">Se muestran los últimos 150 movimientos.</p>
        </Card>
      )}

      {/* ---------- Modales ---------- */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva regla' : 'Editar regla'}>
        <form onSubmit={saveRule} className="space-y-4">
          <Input label="Nombre" placeholder="Ej: Corte gratis" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Visitas necesarias"
              type="number"
              min="1"
              max="100"
              step="1"
              value={form.visits_required}
              onChange={(e) => setForm({ ...form, visits_required: e.target.value })}
            />
            <Select
              label="Cuentan visitas de"
              value={form.service_id}
              onChange={(e) => setForm({ ...form, service_id: e.target.value })}
              options={[{ value: '', label: 'Cualquier servicio' }, ...services.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Premio"
              value={form.reward_type}
              onChange={(e) => setForm({ ...form, reward_type: e.target.value as RewardType })}
              options={(Object.keys(REWARD_TYPES) as RewardType[]).map((k) => ({ value: k, label: REWARD_TYPES[k] }))}
            />
            {form.reward_type !== 'free' && (
              <Input
                label={form.reward_type === 'percent' ? 'Porcentaje (%)' : 'Valor del descuento'}
                type="number"
                min="1"
                max={form.reward_type === 'percent' ? '100' : undefined}
                step="any"
                inputMode="decimal"
                value={form.reward_value}
                onChange={(e) => setForm({ ...form, reward_value: e.target.value })}
              />
            )}
          </div>
          <Input
            label="Descripción para el cliente (opcional)"
            placeholder="Ej: Válido de lunes a jueves"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <p className="text-sm bg-surface rounded p-3">
            Resumen: <strong>{ruleConditionText({ visits_required: Number(form.visits_required) || 0, service: services.find((s) => s.id === form.service_id) ?? null })}</strong>{' '}
            → <strong>{rewardText({ reward_type: form.reward_type, reward_value: Number(form.reward_value) || 0, service: services.find((s) => s.id === form.service_id) ?? null })}</strong>.
            La cita en la que se usa un premio no suma visita.
          </p>
          {editing !== 'new' && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Activa (si la desactivas deja de sumar visitas; los premios ya ganados se respetan)
              </label>
              <p className="text-xs text-inverse/50">
                Si cambias las visitas necesarias, el avance de cada cliente se conserva y se compara con el nuevo número en su próxima visita.
              </p>
            </>
          )}
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!adjustRule} onClose={() => setAdjustRule(null)} title={`Ajustar: ${adjustRule?.name ?? ''}`}>
        <form onSubmit={saveAdjust} className="space-y-4">
          <p className="text-sm text-inverse/60">
            Escribe cuánto <strong>debe quedar</strong>. Útil para cargar la tarjeta de sellos que el cliente ya tenía o corregir un error. Queda en el historial.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={`Visitas (0 a ${(adjustRule?.visits_required ?? 1) - 1})`}
              type="number"
              min="0"
              step="1"
              value={adjust.visits}
              onChange={(e) => setAdjust({ ...adjust, visits: e.target.value })}
            />
            <Input
              label="Premios por usar"
              type="number"
              min="0"
              step="1"
              value={adjust.rewards}
              onChange={(e) => setAdjust({ ...adjust, rewards: e.target.value })}
            />
          </div>
          <Input
            label="Motivo"
            placeholder="Ej: Tarjeta física con 4 sellos"
            value={adjust.note}
            onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
          />
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAdjustRule(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar ajuste</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
