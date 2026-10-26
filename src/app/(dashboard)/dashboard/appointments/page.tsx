'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, Plus, Scissors } from 'lucide-react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, getErrorMessage } from '@/lib/utils';
import { appointmentErrorMessage, appointmentRevenue, money, time12 } from '@/lib/appointments';
import { useLoyaltyForClients } from '@/components/loyalty/useLoyaltyForClients';
import { useAgenda, type AgendaAppointment } from '@/components/agenda/useAgenda';
import { STATUS_FILTERS, STATUS_UI, matchesStatus, type StatusFilter } from '@/components/agenda/agendaUi';
import DayView from '@/components/agenda/DayView';
import WeekView from '@/components/agenda/WeekView';
import MonthView from '@/components/agenda/MonthView';
import AppointmentPanel, { type PanelAction } from '@/components/agenda/AppointmentPanel';
import CompleteAppointmentModal from '@/components/appointments/CompleteAppointmentModal';
import CancelAppointmentModal from '@/components/appointments/CancelAppointmentModal';
import RescheduleModal from '@/components/appointments/RescheduleModal';
import NewAppointmentModal from '@/components/appointments/NewAppointmentModal';

type View = 'day' | 'week' | 'month';
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export default function AppointmentsPage() {
  const { showToast } = useToast();
  const [view, setView] = useState<View>('day');
  const [cursor, setCursor] = useState(new Date());
  const [barberFilter, setBarberFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newWeb, setNewWeb] = useState<{ id: string; date: string; start_time: string; client_name: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toComplete, setToComplete] = useState<AgendaAppointment | null>(null);
  const [toCancel, setToCancel] = useState<AgendaAppointment | null>(null);
  const [toMove, setToMove] = useState<AgendaAppointment | null>(null);
  const [toDelete, setToDelete] = useState<AgendaAppointment | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const set = () => setIsDesktop(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  // Rango a cargar según la vista
  const { from, to } = useMemo(() => {
    if (view === 'day') return { from: ymd(cursor), to: ymd(cursor) };
    if (view === 'week') {
      const s = startOfWeek(cursor, { weekStartsOn: 1 });
      return { from: ymd(s), to: ymd(addDays(s, 6)) };
    }
    return {
      from: ymd(startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })),
      to: ymd(endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })),
    };
  }, [view, cursor]);

  const onNewWeb = useCallback((a: { id: string; date: string; start_time: string; client_name: string | null }) => setNewWeb(a), []);
  const agenda = useAgenda(from, to, onNewWeb);

  const filtered = useMemo(
    () =>
      agenda.appointments
        .filter((a) => (barberFilter === 'all' || a.barber_id === barberFilter) && matchesStatus(a.status, statusFilter))
        .sort((x, y) => (x.date + x.start_time).localeCompare(y.date + y.start_time)),
    [agenda.appointments, barberFilter, statusFilter]
  );
  const visibleBarbers = barberFilter === 'all' ? agenda.barbers : agenda.barbers.filter((b) => b.id === barberFilter);
  const selected = agenda.appointments.find((a) => a.id === selectedId) ?? null;

  const loyalty = useLoyaltyForClients(agenda.appointments.map((a) => a.client_id));
  useEffect(() => {
    loyalty.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda.appointments]);
  const hasReward = useCallback(
    (clientId: string | null) => !!clientId && loyalty.forClient(clientId).some((b) => b.rewards_available > 0),
    [loyalty]
  );

  // Resumen del periodo (por barbero si hay filtro; ventas de productos solo con "todos")
  const summary = useMemo(() => {
    const scope = agenda.appointments.filter((a) => barberFilter === 'all' || a.barber_id === barberFilter);
    const done = scope.filter((a) => a.status === 'completed');
    const services = done.reduce((s, a) => s + appointmentRevenue(a), 0);
    return {
      total: scope.filter((a) => a.status !== 'cancelled').length,
      completed: done.length,
      open: scope.filter((a) => ['pending', 'confirmed', 'in_progress'].includes(a.status)).length,
      noShow: scope.filter((a) => a.status === 'no_show').length,
      services,
      products: barberFilter === 'all' ? agenda.productSales : 0,
    };
  }, [agenda.appointments, agenda.productSales, barberFilter]);

  const step = (dir: 1 | -1) =>
    setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : addMonths(c, dir)));

  const label =
    view === 'day'
      ? format(cursor, "EEEE d 'de' MMMM", { locale: es })
      : view === 'week'
        ? `${format(new Date(`${from}T00:00:00`), "d 'de' MMM", { locale: es })} – ${format(new Date(`${to}T00:00:00`), "d 'de' MMM yyyy", { locale: es })}`
        : format(cursor, 'MMMM yyyy', { locale: es });

  const openDay = (d: Date) => {
    setCursor(d);
    setView('day');
  };

  const setStatus = async (a: AgendaAppointment, status: 'confirmed' | 'in_progress' | 'no_show', msg: string) => {
    setBusy(true);
    const { error } = await createClient().from('appointments').update({ status }).eq('id', a.id);
    setBusy(false);
    if (error) return showToast(appointmentErrorMessage(error), 'error');
    showToast(msg, 'success');
    agenda.reload();
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
    agenda.reload();
  };

  const panel = selected && (
    <AppointmentPanel
      appointment={selected}
      rules={loyalty.rules}
      balances={loyalty.forClient(selected.client_id)}
      busy={busy}
      onAction={onAction}
      onClose={isDesktop ? () => setSelectedId(null) : undefined}
      onRewardChanged={() => {
        agenda.reload();
        loyalty.reload();
      }}
    />
  );

  // En celular la vista Día es una lista (la cuadrícula por barbero no cabe)
  const mobileDayList = (
    <ul className="divide-y divide-surface-300">
      {filtered.length === 0 && (
        <li className="py-10 text-center text-inverse/60">
          <Scissors className="w-8 h-8 mx-auto mb-2 opacity-40" aria-hidden="true" />
          No hay citas para este día
        </li>
      )}
      {filtered.map((a) => {
        const ui = STATUS_UI[a.status];
        return (
          <li key={a.id}>
            <button type="button" onClick={() => setSelectedId(a.id)} className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-container-low">
              <span className="w-[84px] shrink-0 text-sm font-bold whitespace-nowrap">{time12(a.start_time)}</span>
              <span className="w-1 self-stretch rounded" style={{ background: ui.border }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={cn('font-bold truncate', (a.status === 'cancelled' || a.status === 'no_show') && 'line-through')}>
                    {a.client?.name ?? a.client_name ?? 'Cliente'}
                  </span>
                  {a.source === 'web' && <span className="shrink-0 text-[10px] px-1 rounded border border-primary-200 text-primary-700">WEB</span>}
                </span>
                <span className="block text-sm text-inverse/70 truncate">
                  {a.service?.name} · {a.barber?.name}
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
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse">Agenda</h1>
          <p className="text-sm text-inverse/70">Citas por barbero. Se actualiza sola cuando entra una reserva.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Nueva cita
        </Button>
      </div>

      {newWeb && (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
          <Bell className="w-5 h-5 text-primary-700 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm">
            <strong>Nueva reserva web:</strong> {newWeb.client_name ?? 'Cliente'} ·{' '}
            {format(new Date(`${newWeb.date}T00:00:00`), "EEE d 'de' MMM", { locale: es })} a las {time12(newWeb.start_time)}
          </p>
          <button
            type="button"
            className="text-sm font-bold text-primary-700 underline"
            onClick={() => {
              setCursor(new Date(`${newWeb.date}T00:00:00`));
              setView('day');
              setSelectedId(newWeb.id);
              setNewWeb(null);
            }}
          >
            Ver
          </button>
          <button type="button" aria-label="Cerrar aviso" className="text-sm text-inverse/70" onClick={() => setNewWeb(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-surface-300 p-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Anterior" className="p-2 rounded hover:bg-surface-container-low">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className={cn('px-3 min-h-[36px] rounded-lg border text-sm font-semibold', isToday(cursor) ? 'border-primary text-primary-700' : 'border-surface-300')}
          >
            Hoy
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Siguiente" className="p-2 rounded hover:bg-surface-container-low">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <h2 className="font-heading font-bold text-base sm:text-lg first-letter:uppercase mr-auto px-1">{label}</h2>

        <div role="group" aria-label="Vista" className="flex rounded-lg border border-surface-300 overflow-hidden">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn('px-3 min-h-[36px] text-sm font-semibold', view === v ? 'bg-inverse text-white' : 'hover:bg-surface-container-low')}
            >
              {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
        <select aria-label="Barbero" className="input-field !w-auto !py-1.5 text-sm" value={barberFilter} onChange={(e) => setBarberFilter(e.target.value)}>
          <option value="all">Todos los barberos</option>
          {agenda.barbers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select aria-label="Estado" className="input-field !w-auto !py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Citas" value={String(summary.total)} />
        <Stat label="Completadas" value={String(summary.completed)} />
        <Stat label="Por atender" value={String(summary.open)} />
        <Stat label="No llegaron" value={String(summary.noShow)} />
        <Stat
          label="Ingresos"
          value={money(summary.services + summary.products)}
          sub={summary.products ? `Servicios ${money(summary.services)} · Productos ${money(summary.products)}` : 'Servicios cobrados'}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {agenda.error && <p className="text-sm text-error">No se pudo cargar la agenda: {agenda.error}</p>}

      <div className={cn('grid gap-4', selected && isDesktop && 'lg:grid-cols-[1fr_340px]')}>
        <div className={cn('bg-white rounded-xl border border-surface-300 overflow-hidden min-w-0', agenda.loading && 'opacity-60')}>
          {view === 'day' &&
            (isDesktop ? (
              <DayView
                date={from}
                barbers={visibleBarbers}
                appointments={filtered}
                schedules={agenda.schedules}
                breaks={agenda.breaks}
                overrides={agenda.overrides}
                timeOff={agenda.timeOff}
                selectedId={selectedId}
                rewardsByClient={hasReward}
                onSelect={setSelectedId}
              />
            ) : (
              mobileDayList
            ))}
          {view === 'week' && (
            <WeekView
              weekStart={new Date(`${from}T00:00:00`)}
              appointments={filtered}
              selectedId={selectedId}
              showBarber={barberFilter === 'all'}
              onSelect={setSelectedId}
              onOpenDay={openDay}
            />
          )}
          {view === 'month' && <MonthView month={cursor} appointments={filtered} onOpenDay={openDay} />}
        </div>

        {selected && isDesktop && (
          <aside className="bg-white rounded-xl border border-surface-300 p-4 self-start lg:sticky lg:top-4" aria-label="Detalle de la cita">
            {panel}
          </aside>
        )}
      </div>

      {selected && !isDesktop && (
        <Modal isOpen onClose={() => setSelectedId(null)} title="Detalle de la cita">
          {panel}
        </Modal>
      )}

      <NewAppointmentModal
        open={creating}
        initial={{ date: view === 'day' ? from : ymd(new Date()), barberId: barberFilter === 'all' ? null : barberFilter }}
        barbers={agenda.barbers}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          showToast('Cita agendada', 'success');
          agenda.reload();
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
          agenda.reload();
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
          agenda.reload();
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
          agenda.reload();
        }}
      />

      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar cita" size="sm">
        <p className="text-inverse/70 mb-6">
          Eliminar es solo para citas creadas por error: se borra sin dejar historial y no se avisa al cliente. Si el cliente no vendrá, usa «Cancelar…». Esta acción no
          se puede deshacer.
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
    </div>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-surface-300 px-3 py-2.5', className)}>
      <p className="text-xs font-semibold text-inverse/70">{label}</p>
      <p className="text-lg font-heading font-bold text-inverse">{value}</p>
      {sub && <p className="text-[11px] text-inverse/70 truncate">{sub}</p>}
    </div>
  );
}
