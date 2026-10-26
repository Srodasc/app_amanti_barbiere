'use client';

import { addDays, format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { time12 } from '@/lib/appointments';
import { STATUS_UI } from './agendaUi';
import type { AgendaAppointment } from './useAgenda';

/** Semana de lunes a domingo: cada día con sus citas en orden. Clic en el día → vista Día. */
export default function WeekView({
  weekStart,
  appointments,
  selectedId,
  showBarber,
  onSelect,
  onOpenDay,
}: {
  weekStart: Date;
  appointments: AgendaAppointment[];
  selectedId: string | null;
  showBarber: boolean;
  onSelect: (id: string) => void;
  onOpenDay: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[840px] divide-x divide-surface-300">
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const list = appointments.filter((a) => a.date === key);
          return (
            <div key={key} className="min-h-[420px] flex flex-col">
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                className={cn(
                  'px-2 py-2.5 text-left border-b border-surface-300 hover:bg-surface-container-low',
                  isToday(d) && 'bg-primary-50'
                )}
              >
                <span className="block text-xs uppercase font-bold text-inverse/70">{format(d, 'EEE', { locale: es })}</span>
                <span className="flex items-baseline justify-between">
                  <span className={cn('text-lg font-bold', isToday(d) && 'text-primary-700')}>{format(d, 'd')}</span>
                  <span className="text-xs text-inverse/70">{list.length ? `${list.length} citas` : ''}</span>
                </span>
              </button>
              <div className="p-1.5 space-y-1.5 flex-1">
                {list.map((a) => {
                  const ui = STATUS_UI[a.status];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onSelect(a.id)}
                      className={cn('w-full text-left rounded-md px-2 py-1.5', a.id === selectedId && 'outline outline-2 outline-primary')}
                      style={{ background: ui.bg, color: ui.text, border: `1px ${ui.dashed ? 'dashed' : 'solid'} ${ui.border}` }}
                    >
                      <span className="block text-xs font-bold">
                        {time12(a.start_time)}
                        {a.source === 'web' && ' · WEB'}
                      </span>
                      <span className={cn('block text-sm font-semibold truncate', (a.status === 'cancelled' || a.status === 'no_show') && 'line-through')}>
                        {a.client?.name ?? a.client_name ?? 'Cliente'}
                      </span>
                      {showBarber && a.barber && <span className="block text-xs truncate opacity-90">con {a.barber.name}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
