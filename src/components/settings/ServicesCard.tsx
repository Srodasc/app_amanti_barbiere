'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, getCurrentAdmin, getErrorMessage } from '@/lib/utils';
import { money } from '@/lib/appointments';
import type { Service } from '@/types';

const empty = { name: '', duration: '30', price: '', description: '', is_active: true };
const digits = (v: string) => v.replace(/[^\d]/g, '');

/** Servicios de la barbería: crear, editar, activar/desactivar y eliminar (si nunca se usó). */
export default function ServicesCard() {
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<{ service: Service; uses: number } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from('services').select('*').order('is_active', { ascending: false }).order('name');
    if (error) showToast(getErrorMessage(error), 'error');
    setServices((data ?? []) as Service[]);
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setErrors({});
    setOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      duration: String(s.duration_minutes),
      price: String(Math.round(Number(s.price))),
      description: s.description ?? '',
      is_active: s.is_active,
    });
    setErrors({});
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    const duration = Number(form.duration);
    const price = Number(form.price);
    if (form.name.trim().length < 2) err.name = 'Escribe el nombre del servicio.';
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) err.duration = 'Entre 5 y 480 minutos.';
    if (form.price === '' || Number.isNaN(price) || price < 0) err.price = 'Escribe el precio.';
    setErrors(err);
    if (Object.keys(err).length) return;

    setSaving(true);
    const db = createClient();
    const values = {
      name: form.name.trim(),
      duration_minutes: duration,
      price,
      description: form.description.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editing
      ? await db.from('services').update(values).eq('id', editing.id)
      : await db.from('services').insert({ ...values, admin_id: await getCurrentAdmin() });
    setSaving(false);
    if (error) return showToast(getErrorMessage(error), 'error');
    showToast(editing ? 'Servicio actualizado' : 'Servicio creado', 'success');
    setOpen(false);
    load();
  };

  const toggle = async (s: Service) => {
    const { error } = await createClient().from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) return showToast(getErrorMessage(error), 'error');
    showToast(s.is_active ? `«${s.name}» ya no se ofrece en la reserva` : `«${s.name}» vuelve a estar disponible`, 'success');
    load();
  };

  // Eliminar borraría el servicio de las citas que lo usaron (y sus reglas de premios):
  // si ya se usó, solo se permite desactivar.
  const askDelete = async (s: Service) => {
    const { count } = await createClient().from('appointments').select('id', { count: 'exact', head: true }).eq('service_id', s.id);
    setToDelete({ service: s, uses: count ?? 0 });
  };

  const remove = async () => {
    if (!toDelete) return;
    setSaving(true);
    const { error } = await createClient().from('services').delete().eq('id', toDelete.service.id);
    setSaving(false);
    if (error) return showToast(getErrorMessage(error), 'error');
    showToast('Servicio eliminado', 'success');
    setToDelete(null);
    load();
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-inverse">Servicios</h2>
          <p className="text-sm text-inverse/70">Lo que ofreces en la reserva, con su duración y precio.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Nuevo
        </Button>
      </div>

      {services === null ? (
        <p className="text-sm text-inverse/60">Cargando…</p>
      ) : services.length === 0 ? (
        <div className="text-center py-8">
          <Scissors className="w-10 h-10 mx-auto text-inverse/40 mb-3" aria-hidden="true" />
          <p className="text-inverse/70 mb-4">Aún no hay servicios.</p>
          <Button onClick={openNew}>Crear el primero</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => (
            <li
              key={s.id}
              className={cn('rounded-lg border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3', s.is_active ? 'bg-white border-surface-300' : 'bg-surface border-surface-300')}
            >
              <button type="button" onClick={() => openEdit(s)} className="flex-1 min-w-0 text-left">
                <span className={cn('flex items-center gap-2 font-semibold', !s.is_active && 'text-inverse/60')}>
                  {s.name}
                  {!s.is_active && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-surface-300 text-inverse/70">Inactivo</span>}
                </span>
                <span className="flex items-center gap-3 mt-0.5 text-sm text-inverse/70">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {s.duration_minutes} min
                  </span>
                  <span className="font-semibold text-inverse">{money(s.price)}</span>
                </span>
                {s.description && <span className="block text-xs text-inverse/60 mt-0.5 truncate">{s.description}</span>}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-primary-200 text-primary-700 text-sm font-semibold hover:bg-primary-50"
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className={cn(
                    'px-3 h-9 rounded-lg text-sm font-semibold border',
                    s.is_active ? 'border-surface-400 hover:bg-surface' : 'border-success/40 text-success hover:bg-success/10'
                  )}
                >
                  {s.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => askDelete(s)}
                  aria-label={`Eliminar ${s.name}`}
                  className="p-2 rounded-lg text-inverse/60 hover:text-error hover:bg-surface"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Editar servicio' : 'Nuevo servicio'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="svc-name" className="block text-sm font-semibold mb-1.5">
              Nombre
            </label>
            <input
              id="svc-name"
              className="input-field"
              placeholder="Ej: Corte clásico"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-sm text-error mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="svc-duration" className="block text-sm font-semibold mb-1.5">
                Duración (min)
              </label>
              <input
                id="svc-duration"
                inputMode="numeric"
                className="input-field"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: digits(e.target.value) })}
                aria-invalid={!!errors.duration}
              />
              {errors.duration && <p className="text-sm text-error mt-1">{errors.duration}</p>}
            </div>
            <div>
              <label htmlFor="svc-price" className="block text-sm font-semibold mb-1.5">
                Precio
              </label>
              <div className="flex items-center rounded-lg border border-surface-500 bg-white focus-within:border-primary">
                <span className="pl-3 text-inverse/60" aria-hidden="true">
                  $
                </span>
                <input
                  id="svc-price"
                  inputMode="numeric"
                  placeholder="30.000"
                  value={form.price === '' ? '' : Number(form.price).toLocaleString('es-CO')}
                  onChange={(e) => setForm({ ...form, price: digits(e.target.value) })}
                  className="flex-1 min-w-0 h-11 px-2 bg-transparent focus:outline-none"
                  aria-invalid={!!errors.price}
                />
              </div>
              {errors.price && <p className="text-sm text-error mt-1">{errors.price}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="svc-desc" className="block text-sm font-semibold mb-1.5">
              Descripción (opcional)
            </label>
            <textarea
              id="svc-desc"
              className="input-field resize-none"
              rows={2}
              placeholder="Se muestra al cliente en la reserva"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-primary" />
            Disponible en la reserva
          </label>

          {editing && (
            <p className="text-xs text-inverse/70">
              Las citas ya agendadas conservan el precio y la hora con los que se reservaron; los cambios aplican a las nuevas.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" isLoading={saving} className="flex-1">
              {editing ? 'Guardar cambios' : 'Crear servicio'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar servicio" size="sm">
        {toDelete &&
          (toDelete.uses > 0 ? (
            <>
              <p className="text-sm text-inverse/70 mb-6">
                <strong className="text-inverse">{toDelete.service.name}</strong> tiene {toDelete.uses} cita{toDelete.uses > 1 ? 's' : ''} en el historial. Si lo eliminas,
                esas citas y sus reportes quedarían sin servicio. Mejor desactívalo: deja de aparecer en la reserva y el historial se conserva.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setToDelete(null)} className="flex-1">
                  Volver
                </Button>
                {toDelete.service.is_active && (
                  <Button
                    onClick={() => {
                      toggle(toDelete.service);
                      setToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Desactivar
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-inverse/70 mb-6">
                ¿Eliminar <strong className="text-inverse">{toDelete.service.name}</strong>? Nunca se ha usado en una cita. Las reglas de premios ligadas a este servicio también se
                eliminan.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setToDelete(null)} className="flex-1">
                  Volver
                </Button>
                <Button variant="danger" onClick={remove} isLoading={saving} className="flex-1">
                  Eliminar
                </Button>
              </div>
            </>
          ))}
      </Modal>
    </Card>
  );
}
