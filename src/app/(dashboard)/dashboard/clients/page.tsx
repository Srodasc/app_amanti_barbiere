'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, Edit2, Trash2, Merge, AlertTriangle, Gift, Phone, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Modal, Card, Avatar, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { formatPhone, isValidMobile, normalizePhone } from '@/lib/phone';

/**
 * Clientes. El CELULAR identifica al cliente (fidelización, citas, ventas):
 * la base de datos lo guarda siempre en el mismo formato y no permite repetirlo.
 * Si un cliente quedó dos veces, aquí se FUSIONAN sus fichas (citas, sellos y premios).
 */

type Row = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  whatsapp_opt_in: boolean;
  created_at: string;
  appointments: { count: number }[];
  loyalty_balances: { rewards_available: number }[];
};
type Dup = { phone: string; client_ids: string[]; names: string[]; appointments: number[] };

const emptyForm = { name: '', phone: '', email: '', notes: '', whatsapp_opt_in: true };

function errorMessage(m: string) {
  if (m.includes('invalid_phone')) return 'El celular no es válido (7 a 15 dígitos).';
  if (m.includes('clients_phone_key') || m.includes('duplicate key')) return 'phone_in_use';
  if (m.includes('cannot_merge_counter')) return 'El cliente de mostrador no se puede fusionar.';
  if (m.includes('not_authorized')) return 'No tienes permiso para esta acción.';
  return m || 'Ocurrió un error inesperado.';
}

export default function ClientsPage() {
  const supabase = () => createClient();
  const { showToast } = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [dups, setDups] = useState<Dup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [phoneOwner, setPhoneOwner] = useState<Row | null>(null); // celular ya usado por otro cliente
  const [saving, setSaving] = useState(false);

  // fusión: grupo de fichas + cuál se conserva
  const [mergeGroup, setMergeGroup] = useState<Row[] | null>(null);
  const [keepId, setKeepId] = useState('');
  const [mergeSearch, setMergeSearch] = useState('');
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: d }] = await Promise.all([
      supabase()
        .from('clients')
        .select('id, name, phone, email, notes, whatsapp_opt_in, created_at, appointments(count), loyalty_balances(rewards_available)')
        // ojo: neq() también excluiría a los clientes sin celular (NULL)
        .or('phone.is.null,phone.neq.mostrador')
        .order('name'),
      supabase().rpc('find_client_duplicates'),
    ]);
    if (error) showToast(error.message, 'error');
    setRows((data ?? []) as unknown as Row[]);
    setDups((d ?? []) as Dup[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const visits = (r: Row) => r.appointments?.[0]?.count ?? 0;
  const rewards = (r: Row) => (r.loyalty_balances ?? []).reduce((s, b) => s + b.rewards_available, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const digits = q.replace(/\D/g, '');
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (digits.length >= 3 && (r.phone ?? '').includes(digits)) ||
        (r.email ?? '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  // ---------- crear / editar ----------
  const openNew = () => {
    setForm(emptyForm);
    setFormError('');
    setPhoneOwner(null);
    setEditing('new');
  };
  const openEdit = (r: Row) => {
    setForm({ name: r.name, phone: r.phone ?? '', email: r.email ?? '', notes: r.notes ?? '', whatsapp_opt_in: r.whatsapp_opt_in });
    setFormError('');
    setPhoneOwner(null);
    setEditing(r);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setPhoneOwner(null);
    if (form.name.trim().length < 2) return setFormError('Escribe el nombre.');
    if (!isValidMobile(form.phone)) return setFormError('Escribe un celular válido: es lo que identifica al cliente (sellos y premios).');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setFormError('Correo inválido.');

    const phone = normalizePhone(form.phone);
    const owner = rows.find((r) => r.phone === phone && (editing === 'new' || r.id !== (editing as Row).id));
    if (owner) {
      setPhoneOwner(owner);
      return setFormError(`Ese celular ya es de ${owner.name}.`);
    }

    const payload = {
      name: form.name.trim(),
      phone,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      whatsapp_opt_in: form.whatsapp_opt_in,
    };
    setSaving(true);
    const { error } =
      editing === 'new'
        ? await supabase().from('clients').insert(payload)
        : await supabase().from('clients').update(payload).eq('id', (editing as Row).id);
    setSaving(false);
    if (error) {
      const m = errorMessage(error.message);
      return setFormError(m === 'phone_in_use' ? 'Ese celular ya es de otro cliente. Búscalo y fusiónalos.' : m);
    }
    showToast(editing === 'new' ? 'Cliente creado' : 'Cliente actualizado (su historial se conserva)', 'success');
    setEditing(null);
    load();
  };

  // ---------- fusión ----------
  const openMerge = (group: Row[]) => {
    // Por defecto se conserva la ficha con más citas
    const keep = [...group].sort((a, b) => visits(b) - visits(a))[0];
    setKeepId(keep.id);
    setMergeSearch('');
    setFormError('');
    setMergeGroup(group);
  };

  const doMerge = async () => {
    if (!mergeGroup || !keepId) return;
    setSaving(true);
    setFormError('');
    for (const r of mergeGroup) {
      if (r.id === keepId) continue;
      const { error } = await supabase().rpc('merge_clients', { p_keep: keepId, p_merge: r.id });
      if (error) {
        setSaving(false);
        return setFormError(errorMessage(error.message));
      }
    }
    setSaving(false);
    showToast('Clientes fusionados: citas, sellos y premios quedaron en una sola ficha', 'success');
    setMergeGroup(null);
    setEditing(null);
    load();
  };

  const mergeCandidates = useMemo(() => {
    if (!mergeGroup || mergeGroup.length !== 1) return [];
    const q = mergeSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    return rows
      .filter((r) => r.id !== mergeGroup[0].id)
      .filter((r) => r.name.toLowerCase().includes(q) || (digits.length >= 3 && (r.phone ?? '').includes(digits)))
      .slice(0, 8);
  }, [rows, mergeGroup, mergeSearch]);

  // ---------- borrar ----------
  const doDelete = async () => {
    if (!toDelete) return;
    setSaving(true);
    const { error } = await supabase().from('clients').delete().eq('id', toDelete.id);
    setSaving(false);
    if (error) return showToast(errorMessage(error.message), 'error');
    showToast('Cliente eliminado', 'success');
    setToDelete(null);
    load();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-inverse">Clientes</h1>
          <p className="text-inverse/60">{rows.length} clientes · el celular identifica a cada uno</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo cliente
        </Button>
      </div>

      {dups.length > 0 && (
        <Card hover={false} className="!p-4 border border-warning/40">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="font-semibold">
                {dups.length === 1 ? 'Hay un cliente registrado dos veces' : `Hay ${dups.length} clientes registrados más de una vez`}
              </p>
              <p className="text-sm text-inverse/70">
                Tienen el mismo celular escrito distinto, así que sus sellos se reparten. Fusiónalos para que todo quede en una sola ficha.
              </p>
              <ul className="space-y-2">
                {dups.map((d) => {
                  const group = d.client_ids.map((id) => byId.get(id)).filter(Boolean) as Row[];
                  return (
                    <li key={d.phone} className="flex flex-wrap items-center justify-between gap-2 bg-surface rounded p-2 text-sm">
                      <span>
                        <strong>{formatPhone(d.phone)}</strong>: {d.names.join(' · ')}
                      </span>
                      <Button size="sm" onClick={() => openMerge(group)} disabled={group.length < 2}>
                        <Merge className="w-4 h-4 mr-1" /> Fusionar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card className="!p-0" hover={false}>
        <div className="p-4 border-b border-surface-container-low">
          <Input
            placeholder="Buscar por nombre, celular o correo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search className="w-5 h-5" />}
          />
        </div>
        {loading ? (
          <p className="p-6 text-inverse/60">Cargando...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-inverse/60">{rows.length === 0 ? 'Aún no hay clientes.' : 'Sin resultados.'}</p>
        ) : (
          <ul className="divide-y divide-surface-container-low">
            {filtered.map((r) => (
              <li key={r.id} className="p-4 flex items-center gap-3">
                <Avatar name={r.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate flex items-center gap-2">
                    {r.name}
                    {rewards(r) > 0 && (
                      <Badge variant="accent">
                        <Gift className="w-3 h-3 mr-1 inline" />
                        {rewards(r)}
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-inverse/70">
                    {r.phone ? formatPhone(r.phone) : <span className="text-warning">Sin celular (no acumula sellos)</span>}
                    {r.email && ` · ${r.email}`}
                  </p>
                  <p className="text-xs text-inverse/50">
                    {visits(r)} citas · cliente desde {format(new Date(r.created_at), 'MMM yyyy', { locale: es })}
                    {!r.whatsapp_opt_in && ' · no recibe WhatsApp'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button title="Editar" onClick={() => openEdit(r)} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button title="Fusionar con otro cliente" onClick={() => openMerge([r])} className="p-2 rounded-lg text-inverse/60 hover:text-primary hover:bg-surface">
                    <Merge className="w-4 h-4" />
                  </button>
                  <button title="Eliminar" onClick={() => setToDelete(r)} className="p-2 rounded-lg text-inverse/60 hover:text-error hover:bg-surface">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- Crear / editar ---------- */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo cliente' : 'Editar cliente'}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            label="Celular (identifica al cliente)"
            type="tel"
            inputMode="tel"
            placeholder="300 123 4567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            icon={<Phone className="w-4 h-4" />}
          />
          {editing !== 'new' && editing && normalizePhone(form.phone) !== (editing.phone ?? '') && isValidMobile(form.phone) && (
            <p className="text-xs text-inverse/60">Cambias el celular de este cliente: sus citas, sellos y premios se conservan.</p>
          )}
          <Input label="Correo (opcional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} icon={<Mail className="w-4 h-4" />} />
          <div>
            <label className="block text-sm font-medium text-inverse/70 mb-2">Notas (opcional)</label>
            <textarea
              className="input-field resize-none w-full"
              rows={2}
              placeholder="Ej: le gusta el degradado bajo"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.whatsapp_opt_in} onChange={(e) => setForm({ ...form, whatsapp_opt_in: e.target.checked })} />
            Recibe confirmaciones y recordatorios por WhatsApp
          </label>
          {formError && (
            <div className="text-sm text-error space-y-2">
              <p>{formError}</p>
              {phoneOwner && editing && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => (editing === 'new' ? openEdit(phoneOwner) : openMerge([editing as Row, phoneOwner]))}
                >
                  {editing === 'new' ? (
                    <>
                      <Edit2 className="w-4 h-4 mr-1" /> Abrir a {phoneOwner.name}
                    </>
                  ) : (
                    <>
                      <Merge className="w-4 h-4 mr-1" /> Fusionar ambos
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={saving} className="flex-1">Guardar</Button>
          </div>
        </form>
      </Modal>

      {/* ---------- Fusionar ---------- */}
      <Modal isOpen={!!mergeGroup} onClose={() => setMergeGroup(null)} title="Fusionar clientes" size="lg">
        {mergeGroup && (
          <div className="space-y-4">
            {mergeGroup.length === 1 ? (
              <>
                <p className="text-sm text-inverse/70">
                  ¿Con qué cliente es la misma persona que <strong>{mergeGroup[0].name}</strong>?
                </p>
                <Input placeholder="Buscar por nombre o celular" value={mergeSearch} onChange={(e) => setMergeSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
                <ul className="divide-y divide-surface-container-low">
                  {mergeCandidates.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => openMerge([mergeGroup[0], c])} className="w-full text-left p-2 hover:bg-surface rounded">
                        <span className="font-medium">{c.name}</span>{' '}
                        <span className="text-sm text-inverse/60">{formatPhone(c.phone)} · {visits(c)} citas</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="text-sm text-inverse/70">
                  Elige la ficha que <strong>se conserva</strong>. Las demás se unen a ella: citas, ventas, sellos y premios se suman (si al sumar se completan
                  premios, se otorgan) y luego se eliminan. No se puede deshacer.
                </p>
                <ul className="space-y-2">
                  {mergeGroup.map((r) => (
                    <li key={r.id}>
                      <label
                        className={cn(
                          'flex items-center gap-3 p-3 rounded border cursor-pointer',
                          keepId === r.id ? 'border-primary bg-primary/5' : 'border-surface-container-low'
                        )}
                      >
                        <input type="radio" name="keep" checked={keepId === r.id} onChange={() => setKeepId(r.id)} />
                        <span className="flex-1">
                          <span className="block font-medium">
                            {r.name} {keepId === r.id && <Badge variant="success">Se conserva</Badge>}
                          </span>
                          <span className="block text-sm text-inverse/60">
                            {formatPhone(r.phone)} · {visits(r)} citas · {rewards(r)} premios
                            {r.email && ` · ${r.email}`}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {formError && <p className="text-sm text-error">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setMergeGroup(null)} className="flex-1">Cancelar</Button>
              {mergeGroup.length > 1 && (
                <Button type="button" isLoading={saving} onClick={doMerge} className="flex-1">
                  Fusionar
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Eliminar ---------- */}
      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cliente">
        <div className="space-y-4">
          <p className="text-sm">
            Se eliminará <strong>{toDelete?.name}</strong> con sus <strong>sellos y premios</strong>. Sus citas se conservan en la agenda, sin cliente asignado.
            Si es un duplicado, mejor usa <strong>Fusionar</strong> para no perder nada.
          </p>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setToDelete(null)} className="flex-1">Volver</Button>
            <Button type="button" variant="danger" isLoading={saving} onClick={doDelete} className="flex-1">Eliminar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
