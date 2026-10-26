'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO, startOfWeek, addDays, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, ChevronLeft, Clock, Copy, Share2, CalendarPlus, MapPin, User, Zap } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Turnstile from '@/components/Turnstile';
import { cn, formatCurrency } from '@/lib/utils';
import { isValidMobile } from '@/lib/phone';
import { CONSENT_TEXT } from '@/lib/privacy';

/*
 * Reserva pública (v2).
 *   1 Servicio → 2 Barbero → 3 Fecha y hora → 4 Tus datos → Confirmación
 * Los días y horarios disponibles los calcula la base de datos:
 *   /api/days  → qué días tienen cupo (abierto, lleno, festivo, cerrado)
 *   /api/slots → horarios libres de un día (con el barbero que atiende)
 * Celular: tira de días. Escritorio: calendario de los próximos días + horarios al lado.
 */

type Service = { id: string; name: string; description: string | null; duration_minutes: number; price: number };
type Barber = { id: string; name: string; photo_url: string | null; specialty: string | null };
type Day = { date: string; status: 'open' | 'full' | 'holiday' | 'closed'; slots: number; first_time: string | null; first_barber: string | null; label: string | null };
type Slot = { time: string; barber_id: string };
type Step = 'service' | 'barber' | 'when' | 'contact' | 'done';
type Loyalty = { rule_name: string; visits: number; visits_required: number; rewards_available: number };
type Booked = { token: string; date: string; time: string; barberName: string | null; address: string | null; loyalty: Loyalty[] };

const STEP_INFO: Record<Exclude<Step, 'done'>, { n: number; title: string }> = {
  service: { n: 1, title: 'Servicio' },
  barber: { n: 2, title: 'Barbero' },
  when: { n: 3, title: 'Fecha y hora' },
  contact: { n: 4, title: 'Tus datos' },
};

/** "16:30" → "4:30 p. m." */
function time12(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (d: string) => cap(format(parseISO(d), "EEEE d 'de' MMMM", { locale: es }));
const shortDate = (d: string) => cap(format(parseISO(d), "EEE d MMM", { locale: es }));
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/** Hora local de Bogotá (UTC−5, sin horario de verano) → UTC para calendarios */
function toUtcStamp(date: string, time: string, plusMinutes = 0) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const ms = Date.UTC(y, mo - 1, d, h + 5, mi + plusMinutes);
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export default function BookingPage() {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);

  const [service, setService] = useState<Service | null>(null);
  const [barber, setBarber] = useState<Barber | null>(null); // null = sin preferencia

  const [days, setDays] = useState<Day[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [contact, setContact] = useState({ name: '', phone: '', notes: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);

  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const whatsappActive = process.env.NEXT_PUBLIC_WHATSAPP_ACTIVE === 'true';
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaError, setCaptchaError] = useState('');

  const barberName = useCallback((id: string | null | undefined) => barbers.find((b) => b.id === id)?.name ?? null, [barbers]);

  // ---------- carga inicial ----------
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([fetch('/api/services').then((r) => r.json()), fetch('/api/barbers').then((r) => r.json())]);
      setServices(Array.isArray(s) ? s : []);
      setBarbers(Array.isArray(b) ? b : []);
    } catch {
      showToast('No se pudo cargar la información. Revisa tu conexión.', 'error');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------- días disponibles ----------
  const loadDays = useCallback(async () => {
    if (!service) return;
    setDaysLoading(true);
    try {
      const params = new URLSearchParams({ service: service.id });
      if (barber) params.set('barber', barber.id);
      const data = await fetch(`/api/days?${params}`).then((r) => r.json());
      const list: Day[] = Array.isArray(data) ? data : [];
      setDays(list);
      // Conserva el día elegido si sigue abierto; si no, el primero con cupo
      setDate((cur) => (cur && list.some((d) => d.date === cur && d.status === 'open') ? cur : list.find((d) => d.status === 'open')?.date ?? null));
    } catch {
      setDays([]);
      showToast('No se pudieron cargar los días disponibles', 'error');
    }
    setDaysLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, barber]);

  useEffect(() => {
    if (step === 'when') loadDays();
  }, [step, loadDays]);

  // ---------- horarios del día ----------
  useEffect(() => {
    if (!service || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSlotsLoading(true);
      try {
        const params = new URLSearchParams({ service: service.id, date });
        if (barber) params.set('barber', barber.id);
        const data = await fetch(`/api/slots?${params}`).then((r) => r.json());
        if (!cancelled) {
          const list: Slot[] = Array.isArray(data) ? data : [];
          setSlots(list);
          setSlot((cur) => (cur && list.some((s) => s.time === cur.time) ? list.find((s) => s.time === cur.time)! : null));
        }
      } catch {
        if (!cancelled) setSlots([]);
      }
      if (!cancelled) setSlotsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [service, barber, date]);

  const openDays = days.filter((d) => d.status === 'open');
  const earliest = openDays[0] ?? null;

  const groups = useMemo(() => {
    const g = [
      { label: 'Mañana', items: [] as Slot[] },
      { label: 'Tarde', items: [] as Slot[] },
      { label: 'Noche', items: [] as Slot[] },
    ];
    for (const s of slots) {
      const h = Number(s.time.slice(0, 2));
      g[h < 12 ? 0 : h < 18 ? 1 : 2].items.push(s);
    }
    return g.filter((x) => x.items.length > 0);
  }, [slots]);

  // Calendario de escritorio: semanas (lunes a domingo) que cubren los días disponibles
  const calendarCells = useMemo(() => {
    if (days.length === 0) return [];
    const first = parseISO(days[0].date);
    const last = parseISO(days[days.length - 1].date);
    const start = startOfWeek(first, { weekStartsOn: 1 });
    const total = Math.ceil((differenceInCalendarDays(last, start) + 1) / 7) * 7;
    const byDate = new Map(days.map((d) => [d.date, d]));
    return Array.from({ length: total }, (_, i) => {
      const iso = format(addDays(start, i), 'yyyy-MM-dd');
      return { iso, day: byDate.get(iso) ?? null };
    });
  }, [days]);

  // ---------- navegación ----------
  const pickService = (s: Service) => {
    setService(s);
    setSlot(null);
    setStep('barber');
  };
  const pickBarber = (b: Barber | null) => {
    setBarber(b);
    setSlot(null);
    setStep('when');
  };
  const pickEarliest = () => {
    if (!earliest?.first_time) return;
    setDate(earliest.date);
    setSlot({ time: earliest.first_time, barber_id: earliest.first_barber ?? '' });
  };
  const back = () => {
    const order: Step[] = ['service', 'barber', 'when', 'contact'];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  // ---------- reservar ----------
  const submit = async () => {
    const e: Record<string, string> = {};
    if (contact.name.trim().length < 2) e.name = 'Escribe tu nombre.';
    if (!isValidMobile(contact.phone)) e.phone = 'Escribe tu celular de 10 dígitos, por ejemplo 300 123 4567.';
    if (!consent) e.consent = 'Para reservar debes autorizar el uso de tus datos.';
    setErrors(e);
    if (Object.keys(e).length > 0 || !service || !date || !slot) return;
    if (captchaSiteKey && !captchaToken) {
      showToast('Espera un momento: estamos verificando que eres una persona.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: service.id,
          // Con "sin preferencia" se reserva con el barbero que mostraba el horario elegido
          barber_id: barber?.id ?? (slot.barber_id || null),
          date,
          start_time: slot.time,
          client_name: contact.name.trim(),
          client_phone: contact.phone,
          notes: contact.notes.trim() || null,
          data_consent: true,
          captcha_token: captchaToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'No se pudo agendar', 'error');
        if (captchaSiteKey) setCaptchaReset((n) => n + 1);
        if (res.status === 409) {
          // Otro cliente tomó el horario: volver a elegir con datos frescos
          setSlot(null);
          setStep('when');
          loadDays();
        }
        setSubmitting(false);
        return;
      }

      const info = await fetch(`/api/cita/${data.cancel_token}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      setBooked({
        token: data.cancel_token,
        date,
        time: slot.time,
        barberName: data.barber_name ?? info?.barber_name ?? barberName(slot.barber_id),
        address: info?.business_address || null,
        loyalty: Array.isArray(info?.loyalty) ? info.loyalty : [],
      });
      setStep('done');
      window.scrollTo({ top: 0 });
    } catch {
      showToast('Error de conexión. Inténtalo de nuevo.', 'error');
      if (captchaSiteKey) setCaptchaReset((n) => n + 1);
    }
    setSubmitting(false);
  };

  const restart = () => {
    setStep('service');
    setService(null);
    setBarber(null);
    setDate(null);
    setSlot(null);
    setBooked(null);
    setConsent(false);
    setContact((c) => ({ ...c, notes: '' }));
  };

  // ---------- piezas ----------
  const summaryLine = slot && date ? `${shortDate(date)} · ${time12(slot.time)}${barberName(barber?.id ?? slot.barber_id) ? ` con ${barberName(barber?.id ?? slot.barber_id)}` : ''}` : '';

  const DayButton = ({ d, compact }: { d: Day; compact: boolean }) => {
    const disabled = d.status !== 'open';
    const selected = d.date === date;
    const dt = parseISO(d.date);
    const isToday = d.date === todayStr();
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDate(d.date);
          setSlot(null);
        }}
        aria-pressed={selected}
        aria-label={`${longDate(d.date)}${disabled ? `, ${(d.label ?? 'no disponible').toLowerCase()}` : ''}`}
        className={cn(
          'rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors',
          compact ? 'w-[62px] min-h-[76px] shrink-0' : 'w-full min-h-[64px]',
          selected
            ? 'bg-primary text-white border border-primary'
            : disabled
              ? 'bg-surface-200 text-[#6b6461] border border-dashed border-surface-500 cursor-not-allowed'
              : 'bg-white text-inverse border border-surface-400 hover:border-primary'
        )}
      >
        <span className="text-xs font-semibold capitalize">{isToday ? 'hoy' : format(dt, 'EEE', { locale: es })}</span>
        <span className={cn('text-xl font-bold leading-none', disabled && 'line-through')}>{format(dt, 'd')}</span>
        <span className="text-[11px] font-semibold min-h-[14px]">{disabled ? d.label : compact ? '' : format(dt, 'MMM', { locale: es })}</span>
      </button>
    );
  };

  const TimeButton = ({ s }: { s: Slot }) => {
    const selected = slot?.time === s.time;
    const who = !barber ? barberName(s.barber_id) : null;
    const [h, m] = s.time.split(':').map(Number);
    return (
      <button
        type="button"
        onClick={() => setSlot(s)}
        aria-pressed={selected}
        aria-label={`${time12(s.time)}${who ? ` con ${who}` : ''}`}
        className={cn(
          'min-h-[56px] rounded-lg flex flex-col items-center justify-center gap-0.5 border transition-colors',
          selected ? 'bg-primary text-white border-primary' : 'bg-white text-inverse border-surface-400 hover:border-primary'
        )}
      >
        <span className="text-base font-bold">{`${h % 12 || 12}:${String(m).padStart(2, '0')}`}</span>
        {who && <span className={cn('text-xs font-semibold', selected ? 'text-white' : 'text-inverse-50')}>{who}</span>}
      </button>
    );
  };

  const ChoiceSummary = () =>
    service ? (
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-white border border-surface-300 rounded-xl">
        <div className="min-w-0">
          <p className="font-bold text-[15px] truncate">
            {service.name} · {formatCurrency(Number(service.price))}
          </p>
          <p className="text-sm text-inverse-50">
            {service.duration_minutes} min · {barber ? `Con ${barber.name}` : 'Sin preferencia de barbero'}
          </p>
        </div>
        <button type="button" onClick={() => setStep('service')} className="text-sm font-semibold text-primary px-1 py-3 shrink-0">
          Cambiar
        </button>
      </div>
    ) : null;

  const info = step !== 'done' ? STEP_INFO[step] : null;
  const wide = step === 'when';

  return (
    <div className="min-h-screen bg-surface text-inverse">
      <header className="bg-white border-b border-surface-300">
        <div className={cn('mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <div className="flex items-center gap-2">
            {info && info.n > 1 ? (
              <button type="button" onClick={back} aria-label="Volver" className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg hover:bg-surface">
                <ChevronLeft className="w-6 h-6" />
              </button>
            ) : (
              <Link href="/" aria-label="Inicio" className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg hover:bg-surface">
                <ChevronLeft className="w-6 h-6" />
              </Link>
            )}
            <div className="flex flex-col">
              <span className="font-heading font-bold text-lg">Amanti Barbiere</span>
              {info && (
                <span className="text-sm text-inverse-50">
                  Paso {info.n} de 4 · {info.title}
                </span>
              )}
            </div>
          </div>
          {info && (
            <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className={cn('h-1 rounded-full', n <= info.n ? 'bg-primary' : 'bg-surface-400')} />
              ))}
            </div>
          )}
        </div>
      </header>

      <main className={cn('mx-auto px-4 sm:px-6 py-5 sm:py-8', wide ? 'max-w-5xl pb-40 md:pb-10' : 'max-w-2xl')}>
        {/* ---------- 1. Servicio ---------- */}
        {step === 'service' && (
          <section className="space-y-4">
            <h1 className="font-heading text-2xl font-bold">¿Qué servicio quieres?</h1>
            {loading ? (
              <p className="py-8 text-center text-inverse-50">Cargando...</p>
            ) : services.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-inverse-50">No hay servicios disponibles en este momento.</p>
                <button type="button" onClick={loadData} className="btn-secondary px-4 py-2">Reintentar</button>
              </div>
            ) : (
              <div className="grid gap-3">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickService(s)}
                    className={cn(
                      'p-4 rounded-xl border text-left flex justify-between gap-4 bg-white hover:border-primary transition-colors',
                      service?.id === s.id ? 'border-primary' : 'border-surface-300'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{s.name}</span>
                      {s.description && <span className="block text-sm text-inverse-50 mt-1">{s.description}</span>}
                      <span className="mt-2 flex items-center gap-1 text-sm text-inverse-50">
                        <Clock className="w-4 h-4" aria-hidden="true" /> {s.duration_minutes} min
                      </span>
                    </span>
                    <span className="text-lg font-bold text-primary shrink-0">{formatCurrency(Number(s.price))}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------- 2. Barbero ---------- */}
        {step === 'barber' && (
          <section className="space-y-4">
            <ChoiceSummary />
            <h1 className="font-heading text-2xl font-bold">¿Con quién?</h1>
            <button
              type="button"
              onClick={() => pickBarber(null)}
              className="w-full p-4 rounded-xl border border-surface-300 bg-white hover:border-primary flex items-center gap-4 text-left"
            >
              <span className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-primary" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">Sin preferencia</span>
                <span className="block text-sm text-inverse-50">Verás todos los horarios y quién atiende cada uno</span>
              </span>
            </button>
            {barbers.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => pickBarber(b)}
                className="w-full p-4 rounded-xl border border-surface-300 bg-white hover:border-primary flex items-center gap-4 text-left"
              >
                <Avatar name={b.name} src={b.photo_url} size="lg" />
                <span>
                  <span className="block font-semibold">{b.name}</span>
                  {b.specialty && <span className="block text-sm text-primary">{b.specialty}</span>}
                </span>
              </button>
            ))}
          </section>
        )}

        {/* ---------- 3. Fecha y hora ---------- */}
        {step === 'when' && (
          <section className="space-y-5">
            <ChoiceSummary />

            {daysLoading && days.length === 0 ? (
              <p className="py-8 text-center text-inverse-50">Buscando horarios disponibles...</p>
            ) : openDays.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="font-semibold">No hay horarios disponibles en los próximos días.</p>
                <p className="text-sm text-inverse-50">Prueba con otro barbero o escríbenos.</p>
                <button type="button" onClick={() => setStep('barber')} className="btn-secondary px-4 py-2 mt-2">Elegir otro barbero</button>
              </div>
            ) : (
              <>
                {earliest?.first_time && (
                  <button
                    type="button"
                    onClick={pickEarliest}
                    className={cn(
                      'w-full md:w-auto min-h-[64px] rounded-xl flex items-center gap-3 px-4 py-2.5 border text-left transition-colors',
                      date === earliest.date && slot?.time === earliest.first_time
                        ? 'bg-primary text-white border-primary'
                        : 'bg-primary-50 text-primary-700 border-primary-200 hover:border-primary'
                    )}
                  >
                    <Zap className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="block font-bold">Lo más pronto posible</span>
                      <span className="block text-sm">
                        {earliest.date === todayStr() ? 'Hoy' : shortDate(earliest.date)}, {time12(earliest.first_time)}
                        {!barber && barberName(earliest.first_barber) ? ` con ${barberName(earliest.first_barber)}` : ''}
                      </span>
                    </span>
                  </button>
                )}

                <div className="md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-8 space-y-5 md:space-y-0">
                  {/* Días */}
                  <div className="space-y-2">
                    <h2 className="font-heading text-lg font-bold capitalize">
                      {format(parseISO(days[0].date), 'MMMM', { locale: es })}
                      {format(parseISO(days[0].date), 'M') !== format(parseISO(days[days.length - 1].date), 'M') &&
                        ` – ${format(parseISO(days[days.length - 1].date), 'MMMM', { locale: es })}`}
                    </h2>

                    {/* Celular: tira */}
                    <div className="md:hidden flex gap-2 overflow-x-auto -mx-4 px-4 pb-2">
                      {days.map((d) => (
                        <DayButton key={d.date} d={d} compact />
                      ))}
                    </div>

                    {/* Escritorio: calendario */}
                    <div className="hidden md:block">
                      <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center text-xs font-semibold text-inverse-50">
                        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {calendarCells.map((c) =>
                          c.day ? <DayButton key={c.iso} d={c.day} compact={false} /> : <span key={c.iso} aria-hidden="true" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-inverse-50">Los días tachados están cerrados, son festivos o ya no tienen cupos.</p>
                  </div>

                  {/* Horarios */}
                  <div className="space-y-4">
                    {date && <h2 className="font-heading text-lg font-bold">{longDate(date)}</h2>}
                    {slotsLoading ? (
                      <p className="py-6 text-center text-inverse-50">Cargando horarios...</p>
                    ) : groups.length === 0 ? (
                      <p className="py-6 text-center text-inverse-50">Este día ya no tiene horarios. Elige otro.</p>
                    ) : (
                      groups.map((g) => (
                        <div key={g.label} className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-inverse-50">{g.label}</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {g.items.map((s) => (
                              <TimeButton key={s.time} s={s} />
                            ))}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Escritorio: continuar debajo de los horarios */}
                    <div className="hidden md:flex flex-col gap-2 pt-2">
                      <p className={cn('text-sm', slot ? 'font-semibold' : 'text-inverse-50')}>{slot ? summaryLine : 'Elige un horario para continuar'}</p>
                      <button
                        type="button"
                        disabled={!slot}
                        onClick={() => setStep('contact')}
                        className="h-12 rounded-lg bg-primary text-white font-bold disabled:bg-surface-400 disabled:text-inverse-50"
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Celular: barra fija abajo */}
            <div className="md:hidden fixed inset-x-0 bottom-0 bg-white border-t border-surface-300 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-2 z-10">
              <p className={cn('text-sm text-center', slot ? 'font-semibold' : 'text-inverse-50')}>{slot ? summaryLine : 'Elige un horario para continuar'}</p>
              <button
                type="button"
                disabled={!slot}
                onClick={() => setStep('contact')}
                className="h-[52px] rounded-lg bg-primary text-white font-bold text-base disabled:bg-surface-400 disabled:text-inverse-50"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* ---------- 4. Tus datos ---------- */}
        {step === 'contact' && service && date && slot && (
          <section className="space-y-5">
            <div className="p-4 bg-white border border-surface-300 rounded-xl space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-inverse-50">Tu cita</p>
              <div className="flex justify-between gap-2"><span>{service.name}</span><strong>{formatCurrency(Number(service.price))}</strong></div>
              <div className="flex justify-between gap-2"><span>{longDate(date)}</span><strong>{time12(slot.time)}</strong></div>
              {barberName(barber?.id ?? slot.barber_id) && (
                <div className="flex justify-between gap-2"><span>Te atiende</span><strong>{barberName(barber?.id ?? slot.barber_id)}</strong></div>
              )}
              <button type="button" onClick={() => setStep('when')} className="text-sm font-semibold text-primary pt-1">Cambiar fecha u hora</button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="nombre" className="block text-sm font-semibold">Nombre</label>
              <input
                id="nombre"
                autoComplete="name"
                placeholder="Tu nombre"
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
                className="w-full h-[52px] px-4 rounded-lg border border-surface-500 bg-white text-base focus:outline-none focus:border-primary"
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-sm text-error">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="celular" className="block text-sm font-semibold">Celular (WhatsApp)</label>
              <div className="flex h-[52px] rounded-lg border border-surface-500 bg-white overflow-hidden focus-within:border-primary">
                <span className="flex items-center px-3 bg-surface-200 border-r border-surface-500 font-semibold text-inverse-50">+57</span>
                <input
                  id="celular"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="300 123 4567"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  className="flex-1 min-w-0 px-4 text-base bg-transparent focus:outline-none"
                  aria-invalid={!!errors.phone}
                />
              </div>
              {errors.phone ? (
                <p className="text-sm text-error">{errors.phone}</p>
              ) : (
                <p className="text-sm text-inverse-50">Con tu celular sumas sellos para tus premios.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notas" className="block text-sm font-semibold">Notas para el barbero (opcional)</label>
              <textarea
                id="notas"
                rows={2}
                maxLength={300}
                placeholder="Ej: degradado bajo"
                value={contact.notes}
                onChange={(e) => setContact({ ...contact, notes: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-surface-500 bg-white text-base resize-none focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex gap-3 items-start text-sm leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setErrors((x) => ({ ...x, consent: '' }));
                  }}
                  className="w-[22px] h-[22px] mt-0.5 shrink-0 accent-[#775a19]"
                />
                <span>
                  {CONSENT_TEXT}{' '}
                  <a href="/privacidad" target="_blank" rel="noopener" className="text-primary underline font-semibold">
                    Ver Política de datos
                  </a>
                </span>
              </label>
              {errors.consent && <p className="text-sm text-error">{errors.consent}</p>}
            </div>

            {captchaSiteKey && (
              <div className="space-y-1">
                <Turnstile
                  siteKey={captchaSiteKey}
                  resetKey={captchaReset}
                  onToken={(t) => {
                    setCaptchaToken(t);
                    if (t) setCaptchaError('');
                  }}
                  onError={setCaptchaError}
                />
                {captchaError ? (
                  <p className="text-sm text-error text-center">{captchaError}</p>
                ) : (
                  !captchaToken && <p className="text-xs text-inverse-50 text-center">Verificando que eres una persona…</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting || (Boolean(captchaSiteKey) && !captchaToken)}
              className="w-full h-[52px] rounded-lg bg-primary text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Check className="w-5 h-5" aria-hidden="true" />
              {submitting ? 'Agendando…' : 'Confirmar cita'}
            </button>
          </section>
        )}

        {/* ---------- Confirmación ---------- */}
        {step === 'done' && booked && service && (
          <Confirmation booked={booked} service={service} name={contact.name} whatsappActive={whatsappActive} onRestart={restart} />
        )}
      </main>
    </div>
  );
}

function Confirmation({
  booked,
  service,
  name,
  whatsappActive,
  onRestart,
}: {
  booked: Booked;
  service: Service;
  name: string;
  whatsappActive: boolean;
  onRestart: () => void;
}) {
  const { showToast } = useToast();
  const link = typeof window !== 'undefined' ? `${window.location.origin}/cita/${booked.token}` : `/cita/${booked.token}`;
  const firstName = name.trim().split(/\s+/)[0] || '';
  const title = `${service.name} en Amanti Barbiere`;
  const details = `Tu cita${booked.barberName ? ` con ${booked.barberName}` : ''}. Ver o cancelar: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Enlace copiado', 'success');
    } catch {
      showToast('No se pudo copiar. Mantén presionado el enlace para copiarlo.', 'error');
    }
  };

  const share = async () => {
    const text = `Mi cita en Amanti Barbiere: ${longDate(booked.date)}, ${time12(booked.time)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mi cita', text, url: link });
      } catch {
        /* el usuario canceló */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`, '_blank', 'noopener');
    }
  };

  // Archivo .ics: lo abren el calendario del iPhone, Android y Outlook
  const downloadIcs = () => {
    const start = toUtcStamp(booked.date, booked.time);
    const end = toUtcStamp(booked.date, booked.time, service.duration_minutes);
    const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Amanti Barbiere//Reservas//ES',
      'BEGIN:VEVENT',
      `UID:${booked.token}@amanti`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(details)}`,
      booked.address ? `LOCATION:${esc(booked.address)}` : '',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(title)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cita-amanti-barbiere.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  const googleUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${toUtcStamp(booked.date, booked.time)}/${toUtcStamp(booked.date, booked.time, service.duration_minutes)}` +
    `&details=${encodeURIComponent(details)}` +
    (booked.address ? `&location=${encodeURIComponent(booked.address)}` : '');

  const mapsUrl = booked.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booked.address)}` : null;
  const prog = booked.loyalty.find((l) => l.visits_required > 0) ?? null;

  return (
    <section className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-16 h-16 rounded-full bg-success/15 text-success flex items-center justify-center">
          <Check className="w-8 h-8" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl font-bold">¡Listo{firstName ? `, ${firstName}` : ''}!</h1>
        <p className="text-base leading-relaxed">
          <span className="inline-block">{longDate(booked.date)}</span>, <strong>{time12(booked.time)}</strong>
          <br />
          {service.name}
          {booked.barberName ? ` con ${booked.barberName}` : ''}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-primary-50 border border-primary-200 space-y-3">
        <div>
          <p className="font-bold text-primary-700">Guarda el enlace de tu cita</p>
          <p className="text-sm text-primary-700">Con él puedes ver o cancelar tu cita.</p>
        </div>
        <a href={`/cita/${booked.token}`} className="block text-sm text-primary underline break-all">
          {link}
        </a>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className="h-12 rounded-lg bg-primary text-white font-bold flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" aria-hidden="true" /> Copiar enlace
          </button>
          <button type="button" onClick={share} className="h-12 rounded-lg border border-primary text-primary bg-white font-bold flex items-center justify-center gap-2">
            <Share2 className="w-4 h-4" aria-hidden="true" /> Compartir
          </button>
        </div>
      </div>

      <div className={cn('grid gap-2', mapsUrl ? 'grid-cols-2' : 'grid-cols-1')}>
        <button type="button" onClick={downloadIcs} className="min-h-[52px] rounded-lg border border-surface-400 bg-white font-semibold text-sm flex items-center justify-center gap-2">
          <CalendarPlus className="w-4 h-4" aria-hidden="true" /> A mi calendario
        </button>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener" className="min-h-[52px] rounded-lg border border-surface-400 bg-white font-semibold text-sm flex items-center justify-center gap-2 text-inverse no-underline">
            <MapPin className="w-4 h-4" aria-hidden="true" /> Cómo llegar
          </a>
        )}
      </div>
      <p className="text-center text-xs text-inverse-50 -mt-2">
        ¿Usas Google Calendar?{' '}
        <a href={googleUrl} target="_blank" rel="noopener" className="text-primary underline">
          Agrégala ahí
        </a>
      </p>

      {prog && (
        <div className="p-4 rounded-xl bg-white border border-surface-300 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="font-bold">Tus premios</span>
            <span className="text-sm text-inverse-50">{prog.rule_name}</span>
          </div>
          {prog.visits_required <= 12 ? (
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${prog.visits_required}, minmax(0, 1fr))` }} role="img" aria-label={`${prog.visits} de ${prog.visits_required} visitas`}>
              {Array.from({ length: prog.visits_required }, (_, i) => (
                <div key={i} className={cn('h-2.5 rounded-full', i < prog.visits ? 'bg-primary' : 'bg-surface-400')} />
              ))}
            </div>
          ) : (
            <div className="h-2.5 rounded-full bg-surface-400 overflow-hidden" role="img" aria-label={`${prog.visits} de ${prog.visits_required} visitas`}>
              <div className="h-full bg-primary" style={{ width: `${Math.round((prog.visits / prog.visits_required) * 100)}%` }} />
            </div>
          )}
          <p className="text-sm">
            {prog.rewards_available > 0 ? (
              <strong className="text-primary">¡Tienes {prog.rewards_available} premio(s) disponible(s)! Pídelo en tu cita.</strong>
            ) : (
              <>
                Llevas <strong>{prog.visits} de {prog.visits_required}</strong> visitas. Las visitas suman cuando se completa la cita.
              </>
            )}
          </p>
        </div>
      )}

      {whatsappActive && <p className="text-center text-sm text-inverse-50">Te enviamos la confirmación por WhatsApp y te recordaremos antes de la cita.</p>}

      <button type="button" onClick={onRestart} className="w-full h-[52px] rounded-lg border border-surface-500 font-semibold">
        Agendar otra cita
      </button>
    </section>
  );
}
