'use client';

import { useEffect, useState } from 'react';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  User, 
  Scissors,
  X
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  addMonths, 
  subMonths,
  isSameMonth,
  isSameDay,
  isToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppointments } from '@/hooks';
import { isValidMobile } from '@/lib/phone';
import { useBarbers } from '@/hooks/useBarbers';
import { Button, Input, Select, Modal, Card, Avatar, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { formatTime, cn, getErrorMessage, formatCurrency } from '@/lib/utils';
import AppointmentReward from '@/components/loyalty/AppointmentReward';
import { useLoyaltyForClients } from '@/components/loyalty/useLoyaltyForClients';
import { Appointment, AppointmentStatus, APPOINTMENT_STATUSES, Service } from '@/types';
import { createClient } from '@/lib/supabase/client';
import CompleteAppointmentModal from '@/components/appointments/CompleteAppointmentModal';
import CancelAppointmentModal from '@/components/appointments/CancelAppointmentModal';
import { PAYMENT_LABELS, SOURCE_LABELS, appointmentErrorMessage, money, whatsappLink } from '@/lib/appointments';
import { formatPhone } from '@/lib/phone';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'warning',
  confirmed: 'accent',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'error',
  no_show: 'error',
};

const emptyForm = {
  client_phone: '',
  client_name: '',
  service_id: '',
  barber_id: '',
  date: '',
  start_time: '',
  notes: '',
};

export default function AppointmentsPage() {
  const { appointments, updateStatus, deleteAppointment, getAppointmentsByDate, refresh } = useAppointments();
  // Cliente identificado por celular (lookup_client_by_phone)
  const [phoneMatch, setPhoneMatch] = useState<
    { id: string; name: string; visits_total: number; rewards_available: number } | null | 'none'
  >(null);
  const { barbers } = useBarbers();
  const { showToast } = useToast();
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [toComplete, setToComplete] = useState<Appointment | null>(null);
  const [toCancel, setToCancel] = useState<Appointment | null>(null);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isValidMobile(form.client_phone)) {
      setPhoneMatch(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc('lookup_client_by_phone', { p_phone: form.client_phone });
      const row = Array.isArray(data) ? data[0] : data;
      setPhoneMatch(row ? row : 'none');
    }, 300);
    return () => clearTimeout(t);
  }, [form.client_phone]);
  const [services, setServices] = useState<Service[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayAppointments = getAppointmentsByDate(selectedDateStr);
  // Premios de fidelización de los clientes del día; se recargan cuando cambian las citas
  const loyalty = useLoyaltyForClients(dayAppointments.map((a) => a.client_id));
  useEffect(() => {
    loyalty.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments]);

  useEffect(() => {
    createClient()
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setServices(data);
      });
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const generateCalendarDays = () => {
    const days = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  };

  const getAppointmentsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return appointments.filter(a => a.date === dateStr);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const hasPhone = form.client_phone.trim() !== '';
    if (hasPhone && !isValidMobile(form.client_phone)) newErrors.client_phone = 'Celular inválido';
    if (hasPhone && phoneMatch === 'none' && form.client_name.trim().length < 2)
      newErrors.client_name = 'Es un cliente nuevo: escribe su nombre';
    if (!form.service_id) newErrors.service_id = 'Selecciona un servicio';
    if (!form.barber_id) newErrors.barber_id = 'Selecciona un barbero';
    if (!form.date) newErrors.date = 'Selecciona una fecha';
    if (!form.start_time) newErrors.start_time = 'Selecciona una hora';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = () => {
    setForm({ ...emptyForm, date: selectedDateStr });
    setErrors({});
    setIsModalOpen(true);
    
    const loadServices = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('services').select('*').eq('is_active', true);
      if (data) setServices(data);
    };
    loadServices();
  };

  const openDeleteModal = (appointment: Appointment) => {
    setAppointmentToDelete(appointment);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    // La base de datos identifica (o crea) al cliente por su celular, valida el
    // horario y, si hay celular, encola la confirmación por WhatsApp.
    const { error } = await createClient().rpc('create_staff_appointment', {
      p_barber: form.barber_id,
      p_service: form.service_id,
      p_date: form.date,
      p_time: form.start_time,
      p_name: form.client_name.trim() || null,
      p_phone: form.client_phone.trim() || null,
      p_source: 'staff',
      p_notes: form.notes.trim() || null,
    });

    setIsSubmitting(false);

    if (error) {
      const m = error.message;
      showToast(
        m.includes('slot_unavailable')
          ? 'Ese barbero ya tiene una cita a esa hora.'
          : m.includes('invalid_phone')
            ? 'El celular no es válido.'
            : m.includes('invalid_name')
              ? 'Es un cliente nuevo: escribe su nombre.'
              : getErrorMessage(error),
        'error'
      );
    } else {
      showToast('Cita agendada correctamente', 'success');
      setIsModalOpen(false);
      refresh();
    }
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    const appointment = appointments.find((a) => a.id === id);
    // Completar = cobrar (complete_appointment); cancelar pide confirmación y motivo
    if (status === 'completed') return setToComplete(appointment ?? null);
    if (status === 'cancelled') return setToCancel(appointment ?? null);

    const { error } = await updateStatus(id, status);
    if (error) {
      showToast(appointmentErrorMessage(error), 'error');
    } else {
      showToast(`Estado actualizado a ${APPOINTMENT_STATUSES[status]}`, 'success');
    }
  };

  const handleDelete = async () => {
    if (!appointmentToDelete) return;
    
    setIsSubmitting(true);
    const { error } = await deleteAppointment(appointmentToDelete.id);
    setIsSubmitting(false);

    if (error) {
      showToast(getErrorMessage(error), 'error');
    } else {
      showToast('Cita eliminada', 'success');
      setIsDeleteModalOpen(false);
    }
  };

  const calendarDays = generateCalendarDays();
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse">Citas</h1>
          <p className="text-sm sm:text-base text-inverse/60">Gestiona el calendario de citas</p>
        </div>
        <Button onClick={openCreateModal} className="text-sm sm:text-base py-2 sm:py-0">
          <Plus className="w-4 h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Nueva Cita</span>
          <span className="sm:hidden">Agregar</span>
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="lg:col-span-2 !p-3 sm:!p-4 lg:!p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-6">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1 sm:p-2 text-inverse/50 hover:text-inverse hover:bg-surface-container-low rounded transition-colors touch-target"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <h2 className="text-base sm:text-lg font-semibold text-inverse capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1 sm:p-2 text-inverse/50 hover:text-inverse hover:bg-surface-container-low rounded transition-colors touch-target"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-inverse/50 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const dayAppointments = getAppointmentsForDay(day);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'relative p-2 rounded text-sm transition-all min-h-[60px]',
                    isCurrentMonth ? 'text-inverse' : 'text-inverse/30',
                    isSelected && 'bg-primary text-white',
                    isToday(day) && !isSelected && 'bg-surface-container-low',
                  )}
                >
                  <span className={cn(
                    'block w-7 h-7 mx-auto rounded-full flex items-center justify-center',
                    isToday(day) && 'bg-primary/10 text-primary font-semibold'
                  )}>
                    {format(day, 'd')}
                  </span>
                  {dayAppointments.length > 0 && (
                    <div className="flex items-center justify-center gap-0.5 mt-1 flex-wrap">
                      {dayAppointments.slice(0, 3).map((a, j) => (
                        <div 
                          key={j} 
                          className={cn(
                            'w-1.5 h-1.5 rounded-sm',
                            a.status === 'completed' ? 'bg-success' :
                            a.status === 'cancelled' ? 'bg-error' :
                            'bg-primary'
                          )}
                        />
                      ))}
                      {dayAppointments.length > 3 && (
                        <span className="text-[10px] text-inverse/50">+{dayAppointments.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="overflow-x-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-inverse">
                {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <Badge variant={isToday(selectedDate) ? 'accent' : 'default'}>
                {isToday(selectedDate) ? 'Hoy' : `${dayAppointments.length} citas`}
              </Badge>
            </div>

            {dayAppointments.length === 0 ? (
              <div className="text-center py-8">
                <Scissors className="w-10 h-10 mx-auto text-inverse/30 mb-3" />
                <p className="text-inverse/50 text-sm">No hay citas para este día</p>
                <Button variant="ghost" size="sm" onClick={openCreateModal} className="mt-2">
                  Agendar cita
                </Button>
              </div>
            ) : (
              <div className="space-y-3 overflow-x-hidden">
              {dayAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="p-3 bg-surface-container-low rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-inverse">
                        {formatTime(appointment.start_time)}
                      </span>
                    </div>
                    <Badge variant={STATUS_COLORS[appointment.status] as any}>
                      {APPOINTMENT_STATUSES[appointment.status]}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-inverse/50" />
                    <span className="text-sm font-semibold text-inverse">{appointment.client?.name ?? appointment.client_name ?? 'Cliente'}</span>
                    {appointment.barber?.name && <span className="ml-auto text-xs font-semibold text-inverse/70">con {appointment.barber.name}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-inverse/50" />
                    <span className="text-sm text-inverse/70">
                      {appointment.service?.name} · {money(Number(appointment.price ?? appointment.service?.price ?? 0))}
                    </span>
                    {appointment.source && SOURCE_LABELS[appointment.source] && (
                      <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded border border-primary-200 text-primary-700">
                        {SOURCE_LABELS[appointment.source]}
                      </span>
                    )}
                  </div>

                  {appointment.client?.phone && appointment.client.phone !== 'mostrador' && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-inverse/70">{formatPhone(appointment.client.phone)}</span>
                      {whatsappLink(appointment.client.phone) && (
                        <a
                          href={whatsappLink(appointment.client.phone)!}
                          target="_blank"
                          rel="noopener"
                          className="text-xs font-bold px-2 py-1 rounded bg-success/15 text-success hover:bg-success/25"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  {appointment.notes && <p className="text-sm text-inverse/80">“{appointment.notes}”</p>}

                  <AppointmentReward
                    appointment={appointment}
                    rules={loyalty.rules}
                    balances={loyalty.forClient(appointment.client_id)}
                    clientName={appointment.client?.name}
                    clientPhone={appointment.client?.phone}
                    onChanged={() => refresh()}
                  />

                  {appointment.status === 'completed' && appointment.paid_amount != null && (
                    <p className="text-sm font-semibold text-success">
                      Cobrado {money(Number(appointment.paid_amount))}
                      {appointment.payment_method && ` · ${PAYMENT_LABELS[appointment.payment_method] ?? appointment.payment_method}`}
                    </p>
                  )}
                  {appointment.status === 'cancelled' && appointment.cancel_reason && (
                    <p className="text-xs text-inverse/60">Motivo: {appointment.cancel_reason}</p>
                  )}

                  {['pending', 'confirmed', 'in_progress'].includes(appointment.status) && (
                    <div className="space-y-2 pt-2 border-t border-surface-container-low">
                      <div className="flex items-center gap-2">
                        {appointment.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(appointment.id, 'confirmed')}
                            className="flex-1 min-h-[36px] text-xs font-semibold bg-success/15 text-success rounded hover:bg-success/25 transition-colors"
                          >
                            Confirmar
                          </button>
                        )}
                        {appointment.status !== 'in_progress' && (
                          <button
                            onClick={() => handleStatusChange(appointment.id, 'in_progress')}
                            className="flex-1 min-h-[36px] text-xs font-semibold bg-info/15 text-info rounded hover:bg-info/25 transition-colors"
                          >
                            Iniciar
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusChange(appointment.id, 'completed')}
                          className="flex-[2] min-h-[36px] text-xs font-bold bg-primary text-white rounded hover:bg-primary-600 transition-colors"
                        >
                          Completar y cobrar
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStatusChange(appointment.id, 'no_show')}
                          className="flex-1 min-h-[34px] text-xs font-semibold border border-surface-container-low rounded hover:bg-surface transition-colors"
                        >
                          No llegó
                        </button>
                        <button
                          onClick={() => handleStatusChange(appointment.id, 'cancelled')}
                          className="flex-1 min-h-[34px] text-xs font-semibold text-error border border-error/30 rounded hover:bg-error/10 transition-colors"
                        >
                          Cancelar…
                        </button>
                      </div>
                    </div>
                  )}

                  {appointment.status !== 'completed' && (
                    <button
                      onClick={() => openDeleteModal(appointment)}
                      className="w-full p-1 text-[11px] text-inverse/50 hover:text-error transition-colors"
                    >
                      Eliminar (creada por error)
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Cita"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Celular del cliente"
            type="tel"
            inputMode="tel"
            placeholder="300 123 4567"
            value={form.client_phone}
            onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
            error={errors.client_phone}
          />
          {phoneMatch && phoneMatch !== 'none' ? (
            <p className="text-sm -mt-2 text-success">
              {phoneMatch.name} · {phoneMatch.visits_total} visitas
              {phoneMatch.rewards_available > 0 && ` · tiene ${phoneMatch.rewards_available} premio(s)`}
            </p>
          ) : (
            <>
              {phoneMatch === 'none' && <p className="text-sm -mt-2 text-inverse/60">Cliente nuevo: se creará con este celular.</p>}
              {form.client_phone.trim() === '' && (
                <p className="text-xs -mt-2 text-warning">Sin celular la cita queda como cliente de mostrador y no suma sellos.</p>
              )}
              <Input
                label={phoneMatch === 'none' ? 'Nombre del cliente nuevo' : 'Nombre (opcional)'}
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                error={errors.client_name}
              />
            </>
          )}

          <Select
            label="Servicio"
            placeholder="Selecciona un servicio"
            value={form.service_id}
            onChange={(e) => setForm({ ...form, service_id: e.target.value })}
            error={errors.service_id}
            options={services.map(s => ({ value: s.id, label: `${s.name} · ${money(Number(s.price))}` }))}
          />

          <Select
            label="Barbero"
            placeholder="Selecciona un barbero"
            value={form.barber_id}
            onChange={(e) => setForm({ ...form, barber_id: e.target.value })}
            error={errors.barber_id}
            options={barbers.filter(b => b.is_active).map(b => ({ value: b.id, label: b.name }))}
          />

          <Input
            label="Fecha"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            error={errors.date}
          />

          <Input
            label="Hora"
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            error={errors.start_time}
          />

          <div>
            <label className="block text-sm font-medium text-inverse/70 mb-2">
              Notas (opcional)
            </label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Notas sobre la cita..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="flex-1">
              Agendar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Cita"
        size="sm"
      >
        <p className="text-inverse/60 mb-6">
          Eliminar es solo para citas creadas por error: se borra sin dejar historial y no se avisa al cliente. Si el cliente no vendrá, usa «Cancelar cita». Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => setIsDeleteModalOpen(false)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={isSubmitting}
            className="flex-1"
          >
            Eliminar
          </Button>
        </div>
      </Modal>

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
          refresh();
        }}
      />
    </div>
  );
}
