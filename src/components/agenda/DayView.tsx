'use client';

import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { time12 } from '@/lib/appointments';
import { HATCH, STATUS_UI, toMin } from './agendaUi';
import { workWindow, type AgendaAppointment, type AgendaBarber, type Break, type Override, type Schedule, type TimeOff } from './useAgenda';

const ROW = 36; // px por media hora

/**
 * Vista Día por barbero: una columna por barbero con sus citas como bloques en la
 * línea de horas. Rayado = descanso, bloqueo o fuera de horario. Línea roja = ahora.
 */
export default function DayView({
  date,
  barbers,
  appointments,
  schedules,
  breaks,
  overrides,
  timeOff,
  selectedId,
  rewardsByClient,
  onSelect,
}: {
  date: string;
  barbers: AgendaBarber[];
  appointments: AgendaAppointment[];
  schedules: Schedule[];
  breaks: Break[];
  overrides: Override[];
  timeOff: TimeOff[];
  selectedId: string | null;
  rewardsByClient: (clientId: string | null) => boolean;
  onSelect: (id: string) => void;
}) {
  const dow = new Date(`${date}T00:00:00`).getDay();
  const windows = barbers.map((b) => ({ b, w: workWindow(b.id, date, schedules, overrides) }));

  // Rango de horas: desde el primer inicio hasta el último fin (incluye citas fuera de horario)
  const starts = [...windows.filter((x) => x.w.start).map((x) => toMin(x.w.start!)), ...appointments.map((a) => toMin(a.start_time))];
  const ends = [...windows.filter((x) => x.w.end).map((x) => toMin(x.w.end!)), ...appointments.map((a) => toMin(a.end_time))];
  const from = Math.floor((starts.length ? Math.min(...starts) : 9 * 60) / 60) * 60;
  const to = Math.ceil((ends.length ? Math.max(...ends) : 19 * 60) / 60) * 60;
  const total = ((to - from) / 30) * ROW;
  const y = (min: number) => ((min - from) / 30) * ROW;

  const now = new Date();
  const isToday = date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const hours: number[] = [];
  for (let m = from; m <= to; m += 60) hours.push(m);

  if (barbers.length === 0) return <p className="p-6 text-inverse/60">No hay barberos activos.</p>;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 64 + barbers.length * 200 }}>
        <div className="flex border-b border-surface-300 sticky top-0 bg-white z-10">
          <div className="w-16 shrink-0" />
          {windows.map(({ b, w }) => {
            const list = appointments.filter((a) => a.barber_id === b.id);
            const open = list.filter((a) => ['pending', 'confirmed', 'in_progress'].includes(a.status)).length;
            return (
              <div key={b.id} className="flex-1 min-w-[200px] px-3 py-2.5 border-l border-surface-300 flex items-center gap-2.5">
                <span aria-hidden="true" className="w-8 h-8 rounded-full bg-primary-50 text-primary-700 font-bold text-sm flex items-center justify-center">
                  {b.name[0]}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-[15px] truncate">{b.name}</span>
                  <span className="block text-xs text-inverse/70">
                    {w.start ? `${list.length} citas · ${open} por atender` : w.reason}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex relative pt-2 pb-4">
          <div className="w-16 shrink-0 relative" style={{ height: total }}>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 text-xs text-inverse/70 whitespace-nowrap" style={{ top: y(m) - 7 }}>
                {time12(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`).replace(':00 ', ' ')}
              </span>
            ))}
          </div>

          {windows.map(({ b, w }) => {
            const blocks: { top: number; height: number; label: string; sub: string }[] = [];
            const range = (s: number, e: number, label: string) => {
              const a = Math.max(s, from);
              const z = Math.min(e, to);
              if (z > a) blocks.push({ top: y(a), height: y(z) - y(a), label, sub: `${time12(fmt(a))} – ${time12(fmt(z))}` });
            };
            if (!w.start || !w.end) range(from, to, w.reason ?? 'No trabaja');
            else {
              range(from, toMin(w.start), 'Fuera de horario');
              range(toMin(w.end), to, 'Fuera de horario');
              breaks.filter((x) => x.barber_id === b.id && x.day_of_week === dow).forEach((x) => range(toMin(x.start_time), toMin(x.end_time), 'Descanso'));
              timeOff
                .filter((t) => t.barber_id === b.id)
                .forEach((t) => {
                  const s = t.starts_at.slice(0, 10) < date ? from : toMin(t.starts_at.slice(11, 16));
                  const e = t.ends_at.slice(0, 10) > date ? to : toMin(t.ends_at.slice(11, 16));
                  range(s, e, t.reason ? `Bloqueado · ${t.reason}` : 'Bloqueado');
                });
            }

            return (
              <div
                key={b.id}
                className="flex-1 min-w-[200px] relative border-l border-surface-300"
                style={{
                  height: total,
                  backgroundImage: `repeating-linear-gradient(to bottom, #ebe4df 0, #ebe4df 1px, transparent 1px, transparent ${ROW * 2}px)`,
                  backgroundPositionY: `${y(Math.ceil(from / 60) * 60)}px`,
                }}
              >
                {blocks.map((k, i) => (
                  <div
                    key={i}
                    className="absolute left-1.5 right-1.5 rounded-lg border border-dashed border-surface-500 px-2 py-1 overflow-hidden text-inverse/70"
                    style={{ top: k.top + 2, height: k.height - 4, background: HATCH }}
                  >
                    <span className="block text-xs font-bold">{k.label}</span>
                    {k.height > 40 && <span className="block text-xs">{k.sub}</span>}
                  </div>
                ))}

                {appointments
                  .filter((a) => a.barber_id === b.id)
                  .map((a) => {
                    const ui = STATUS_UI[a.status];
                    const top = y(toMin(a.start_time));
                    const h = Math.max(y(toMin(a.end_time)) - top, ROW);
                    const tall = h >= ROW * 2 - 1;
                    const short = h < ROW * 1.5; // 30 min o menos: una sola línea
                    const selected = a.id === selectedId;
                    const name = a.client?.name ?? a.client_name ?? 'Cliente';
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onSelect(a.id)}
                        aria-label={`${name}, ${time12(a.start_time)}, ${ui.label}`}
                        aria-pressed={selected}
                        className={cn(
                          'absolute left-1.5 right-1.5 rounded-lg px-2 py-1 text-left overflow-hidden flex flex-col gap-px transition-shadow',
                          selected && 'z-[2] shadow-lg outline outline-[3px] outline-offset-1 outline-primary'
                        )}
                        style={{
                          top: top + 2,
                          height: h - 4,
                          background: ui.bg,
                          color: ui.text,
                          border: `1px ${ui.dashed ? 'dashed' : 'solid'} ${ui.border}`,
                        }}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap min-w-0">
                          {time12(a.start_time).replace(/ [ap]\. m\./, '')}
                          {short && (
                            <span className={cn('text-sm truncate', (a.status === 'no_show' || a.status === 'cancelled') && 'line-through')}>{name}</span>
                          )}
                          {a.source === 'web' && (
                            <span className="text-[10px] px-1 rounded bg-white border border-primary-200 text-primary-700">WEB</span>
                          )}
                          {a.status !== 'completed' && rewardsByClient(a.client_id) && <Gift className="w-3.5 h-3.5" aria-label="Tiene premio" />}
                        </span>
                        {!short && <span className={cn('text-sm font-bold truncate', (a.status === 'no_show' || a.status === 'cancelled') && 'line-through')}>{name}</span>}
                        {tall && <span className="text-xs truncate opacity-90">{a.service?.name}</span>}
                      </button>
                    );
                  })}
              </div>
            );
          })}

          {isToday && nowMin >= from && nowMin <= to && (
            <>
              <div aria-hidden="true" className="absolute left-14 right-0 h-0.5 bg-[#c62828] z-[3] pointer-events-none" style={{ top: y(nowMin) + 8 }} />
              <div aria-hidden="true" className="absolute left-[50px] w-3 h-3 rounded-full bg-[#c62828] z-[3] pointer-events-none" style={{ top: y(nowMin) + 3 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
