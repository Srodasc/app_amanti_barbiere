'use client';

import { addDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AgendaAppointment } from './useAgenda';

const WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Mes: cuántas citas hay cada día (sin contar canceladas). Clic en un día → vista Día. */
export default function MonthView({
  month,
  appointments,
  onOpenDay,
}: {
  month: Date;
  appointments: AgendaAppointment[];
  onOpenDay: (d: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  return (
    <div className="p-2 sm:p-4">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK.map((w) => (
          <div key={w} className="text-center text-xs font-bold text-inverse/70 py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const list = appointments.filter((a) => a.date === key && a.status !== 'cancelled');
          const open = list.filter((a) => ['pending', 'confirmed', 'in_progress'].includes(a.status)).length;
          const inMonth = isSameMonth(d, month);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(d)}
              aria-label={`${format(d, 'd')}: ${list.length} citas`}
              className={cn(
                'min-h-[64px] sm:min-h-[84px] rounded-lg border p-1.5 text-left flex flex-col hover:border-primary transition-colors',
                inMonth ? 'border-surface-300 bg-white' : 'border-transparent bg-surface text-inverse/40',
                isToday(d) && 'border-primary bg-primary-50'
              )}
            >
              <span className={cn('text-sm font-bold', isToday(d) && 'text-primary-700')}>{format(d, 'd')}</span>
              {list.length > 0 && (
                <span className="mt-auto">
                  <span className="block text-sm sm:text-base font-bold">{list.length}</span>
                  <span className="hidden sm:block text-[11px] text-inverse/70">{open ? `${open} por atender` : 'citas'}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
