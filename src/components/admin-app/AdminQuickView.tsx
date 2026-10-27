'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Plus, Scissors, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, getErrorMessage } from '@/lib/utils';
import { appointmentErrorMessage, appointmentRevenue, money, time12 } from '@/lib/appointments';
import { useAgenda, type AgendaAppointment } from '@/components/agenda/useAgenda';
import { STATUS_UI } from '@/components/agenda/agendaUi';
import AppointmentPanel, { type PanelAction } from '@/components/agenda/AppointmentPanel';
import { useLoyaltyForClients } from '@/components/loyalty/useLoyaltyForClients';
import CompleteAppointmentModal from '@/components/appointments/CompleteAppointmentModal';
import CancelAppointmentModal from '@/components/appointments/CancelAppointmentModal';
import RescheduleModal from '@/components/appointments/RescheduleModal';
import NewAppointmentModal from '@/components/appointments/NewAppointmentModal';
import SaleForm from '@/components/products/SaleForm';
import MySalesToday from '@/components/products/MySalesToday';
import InstallAppCard from '@/components/pwa/InstallAppCard';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Vista rápida del administrador en la app instalada: la agenda del día de todos
 * los barberos, cobrar, mover, cancelar, crear citas y vender. Para todo lo demás,
 * el botón "Panel completo" lleva al panel con todos los módulos.
 */
export default function AdminQuickView({ onSignOut }: { onSignOut: () => void }) {
  const { showToast } = useToast();
  const [date, setDate] = useState(ymd(new Date()));
  const [tab, setTab] = useState<'agenda' | 'vender'>('agenda');
  const [barber, setBarber] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toComplete, setToComplete] = useState<AgendaAppointment | null>(null);
  const [toCancel, setToCancel] = useState<AgendaAppointment | null>(null);
  const [toMove, setToMove] = useState<AgendaAppointment | null>(null);
  const [toDelete, setToDelete] = useState<AgendaAppointment | null>(null);
  const [salesKey, setSalesKey] = useState(0);
  const [newWeb, setNewWeb] = useState<{ id: string; date: string; start_time: string; client_name: string | null } | null>(null);

  const onNewWeb = useCallback((a: { id: string; date: string; start_time: string; client_name: string | null }) => setNewWeb(a), []);
  const agenda = useAgenda(date, date, onNewWeb);
  const loyalty = useLoyaltyForClients(agenda.appointments.map((a) => a.client_id));
  useEffect(() => {
    loyalty.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda.appointments]);

  const list = useMemo(
    () =>
      agenda.appointments
        .filter((a) => a.status !== 'cancelled' && (barber === 'all' || a.barber_id === barber))
        .sort((x, y) => x.start_time.localeCompare(y.start_time)),
    [agenda.appointments, barber]
  );
  const selected = agenda.appointments.find((a) => a.id === selectedId) ?? null;
  const open = list.filter((a) => ['pending', 'confirmed', 'in_progress'].includes(a.status)).length;
  const charged = list.filter((a) => a.status === 'completed').reduce((s, a) => s + appointmentRevenue(a), 0);
  const isToday = date === ymd(new Date());

  const refresh = () => {
    agenda.reload();
    loyalty.reload();
    setSalesKey((k) => k + 1);
  };

  const setStatus = async (a: AgendaAppointment, status: 'confirmed' | 'in_progress' | 'no_show', msg: string) => {
    setBusy(true);
    const { error } = await createClient().from('appointments').update({ status }).eq('id', a.id);
    setBusy(false);
    if (error) return showToast(appointmentErrorMessage(error), 'error');
    showToast(msg, 'success');
    refresh();
  };

  const onAction = (action: PanelAction) => {
    const a = selected;
    if (!a) return;
    if (action === 'confirm') return setStatus(a, 'confirmed', 'Cita confirmada');
    if (action === 'start') return setStatus(a, 'in_progress', 'Cita en curso');
    if (action === 'no_show') return setStatus(a, 'no_show', 'Marcada como «No llegó»');
    if (action === 'complete') return setToComplete(a);
    if (action === 'cancel') return setToCancel(a);
    if (action === 'reschedule') return setToMove(a);
    if (action === 'delete') return setToDelete(a);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await createClient().from('appointments').delete().eq('id', toDelete.id);
    setBusy(false);
    if (error) return showToast(getErrorMessage(error), 'error');
    showToast('Cita eliminada', 'success');
    setToDelete(null);
    setSelectedId(null);
    refresh();
  };

  return (
    <main className="min-h-screen bg-surface">
      {/* Barra superior: siempre a mano el panel completo */}
      <header className="sticky top-0 z-30 bg-inverse text-white">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center gap-2">
          <Scissors className="w-5 h-5 text-gold-light shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0 flex items-baseline gap-2"><span className="font-heading font-bold truncate">Amanti</span><span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Admin</span></span>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-600 shrink-0"
          >
            <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> Panel completo
          </Link>
          <button type="button" onClick={onSignOut} aria-label="Cerrar sesión" className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10 shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-28">
        <InstallAppCard />

        {newWeb && (
          <div role="status" className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5">
            <Bell className="w-5 h-5 text-primary-700 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm">
              <strong>Nueva reserva:</strong> {newWeb.client_name ?? 'Cliente'} · {format(parseISO(newWeb.date), "EEE d MMM", { locale: es })}, {time12(newWeb.start_time)}
            </p>
            <button
              type="button"
              className="text-sm font-bold text-primary-700 underline"
              onClick={() => {
                setDate(newWeb.date);
                setTab('agenda');
                setSelectedId(newWeb.id);
                setNewWeb(null);
              }}
            >
              Ver
            </button>
          </div>
        )}

        {/* Día */}
        <div className="flex items-center gap-1 bg-white rounded-xl border border-surface-300 p-1">
          <button type="button" aria-label="Día anterior" onClick={() => setDate(ymd(addDays(parseISO(date), -1)))} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="flex-1 text-center">
            <span className="block font-heading font-bold leading-tight">{isToday ? 'Hoy' : cap(format(parseISO(date), 'EEEE', { locale: es }))}</span>
            <span className="block text-xs text-inverse/70">{format(parseISO(date), "d 'de' MMMM", { locale: es })}</span>
          </span>
          {!isToday && (
            <button type="button" onClick={() => setDate(ymd(new Date()))} className="px-3 h-9 rounded-lg border border-surface-300 text-sm font-semibold">
              Hoy
            </button>
          )}
          <button type="button" aria-label="Día siguiente" onClick={() => setDate(ymd(addDays(parseISO(date), 1)))} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border border-surface-300 px-3 py-2">
            <p className="text-xs text-inverse/70">Citas</p>
            <p className="text-lg font-bold">{list.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 px-3 py-2">
            <p className="text-xs text-inverse/70">Por atender</p>
            <p className="text-lg font-bold">{open}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 px-3 py-2">
            <p className="text-xs text-inverse/70">Cobrado</p>
            <p className="text-lg font-bold truncate">{money(charged)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2" role="tablist">
          {(
            [
              ['agenda', 'Agenda'],
              ['vender', 'Vender'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn('h-10 rounded-lg text-sm font-semibold', tab === k ? 'bg-primary text-white' : 'bg-white text-inverse/80 border border-surface-300')}
            >
              {label}
            </button>
          ))}
          <Link href="/dashboard/cash" className="h-10 rounded-lg text-sm font-semibold bg-white text-inverse/80 border border-surface-300 flex items-center justify-center gap-1.5">
            <Wallet className="w-4 h-4" aria-hidden="true" /> Caja
          </Link>
        </div>

        {tab === 'agenda' ? (
          <>
            {agenda.barbers.length > 1 && (
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
                {[{ id: 'all', name: 'Todos' }, ...agenda.barbers].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={barber === b.id}
                    onClick={() => setBarber(b.id)}
                    className={cn(
                      'shrink-0 px-3.5 h-9 rounded-full border text-sm font-semibold',
                      barber === b.id ? 'bg-inverse text-white border-inverse' : 'bg-white border-surface-300'
                    )}
                  >
                    {b.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}

            {agenda.error && <p className="text-sm text-error">{agenda.error}</p>}
            <ul className={cn('bg-white rounded-xl border border-surface-300 divide-y divide-surface-300', agenda.loading && 'opacity-60')}>
              {!agenda.loading && list.length === 0 && <li className="py-10 text-center text-inverse/60">No hay citas este día.</li>}
              {list.map((a) => {
                const ui = STATUS_UI[a.status];
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => setSelectedId(a.id)} className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-surface">
                      <span className="w-[76px] shrink-0 text-sm font-bold whitespace-nowrap">{time12(a.start_time)}</span>
                      <span className="w-1 self-stretch rounded" style={{ background: ui.border }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={cn('font-bold truncate', a.status === 'no_show' && 'line-through')}>{a.client?.name ?? a.client_name ?? 'Cliente'}</span>
                          {a.source === 'web' && <span className="shrink-0 text-[10px] px-1 rounded border border-primary-200 text-primary-700">WEB</span>}
                        </span>
                        <span className="block text-sm text-inverse/70 truncate">
                          {a.service?.name} · {a.barber?.name?.split(' ')[0]}
                        </span>
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: ui.bg, color: ui.text }}>
                        {ui.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-surface-300 p-4">
              <h2 className="font-semibold mb-3">Vender productos</h2>
              <SaleForm
                key={salesKey}
                onDone={() => {
                  showToast('Venta registrada', 'success');
                  setSalesKey((k) => k + 1);
                }}
              />
            </div>
            <MySalesToday refreshKey={salesKey} title="Ventas de hoy" />
          </div>
        )}
      </div>

      {tab === 'agenda' && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="fixed z-20 right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] h-14 px-5 rounded-full bg-primary text-white font-bold shadow-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" aria-hidden="true" /> Nueva cita
        </button>
      )}

      {selected && (
        <Modal isOpen onClose={() => setSelectedId(null)} title="Detalle de la cita">
          <AppointmentPanel
            appointment={selected}
            rules={loyalty.rules}
            balances={loyalty.forClient(selected.client_id)}
            busy={busy}
            onAction={onAction}
            onRewardChanged={refresh}
          />
        </Modal>
      )}

      <NewAppointmentModal
        open={creating}
        initial={{ date, barberId: barber === 'all' ? null : barber }}
        barbers={agenda.barbers}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          showToast('Cita agendada', 'success');
          refresh();
        }}
      />

      <RescheduleModal
        target={
          toMove && {
            id: toMove.id,
            clientName: toMove.client?.name ?? toMove.client_name,
            date: toMove.date,
            startTime: toMove.start_time,
            barberId: toMove.barber_id,
            serviceId: toMove.service_id,
            hasReward: !!toMove.reward_rule_id,
          }
        }
        barbers={agenda.barbers}
        schedules={agenda.schedules}
        onClose={() => setToMove(null)}
        onDone={() => {
          setToMove(null);
          showToast('Cita reprogramada', 'success');
          refresh();
        }}
      />

      <CompleteAppointmentModal
        target={
          toComplete && {
            id: toComplete.id,
            clientName: toComplete.client?.name ?? toComplete.client_name,
            serviceId: toComplete.service_id,
            serviceName: toComplete.service?.name ?? null,
            price: Number(toComplete.price ?? toComplete.service?.price ?? 0),
            barberName: toComplete.barber?.name ?? null,
            startTime: toComplete.start_time,
            hasReward: !!toComplete.reward_rule_id,
          }
        }
        onClose={() => setToComplete(null)}
        onDone={(total) => {
          showToast(`Cobro registrado: ${money(total)}`, 'success');
          setToComplete(null);
          refresh();
        }}
      />

      <CancelAppointmentModal
        target={
          toCancel && {
            id: toCancel.id,
            clientName: toCancel.client?.name ?? toCancel.client_name,
            startTime: toCancel.start_time,
            hasReward: !!toCancel.reward_rule_id,
          }
        }
        onClose={() => setToCancel(null)}
        onDone={() => {
          showToast('Cita cancelada', 'success');
          setToCancel(null);
          setSelectedId(null);
          refresh();
        }}
      />

      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cita" size="sm">
        <p className="text-inverse/70 mb-6">
          Eliminar es solo para citas creadas por error: se borra sin dejar historial y no se avisa al cliente. Si el cliente no vendrá, usa «Cancelar…».
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setToDelete(null)} className="flex-1">
            Volver
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={busy} className="flex-1">
            Eliminar
          </Button>
        </div>
      </Modal>
    </main>
  );
}
