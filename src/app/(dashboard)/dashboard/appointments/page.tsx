'use client';

import { useState } from 'react';
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
import { useAppointments, useClients, useExpenses } from '@/hooks';
import { Button, Input, Select, Modal, Card, Avatar, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { formatTime, cn, getErrorMessage } from '@/lib/utils';
import { Appointment, AppointmentStatus, APPOINTMENT_STATUSES, Service } from '@/types';
import { createClient } from '@/lib/supabase/client';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'warning',
  confirmed: 'accent',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'error',
};

const emptyForm = {
  client_id: '',
  service_id: '',
  date: '',
  start_time: '',
  notes: '',
};

export default function AppointmentsPage() {
  const { appointments, addAppointment, updateStatus, deleteAppointment, getAppointmentsByDate } = useAppointments();
  const { clients } = useClients();
  const { addExpense } = useExpenses();
  const { showToast } = useToast();
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [services, setServices] = useState<Service[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayAppointments = getAppointmentsByDate(selectedDateStr);

  useState(() => {
    const loadServices = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('services').select('*').eq('is_active', true);
      if (data) setServices(data);
    };
    loadServices();
  });

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
    if (!form.client_id) newErrors.client_id = 'Selecciona un cliente';
    if (!form.service_id) newErrors.service_id = 'Selecciona un servicio';
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
    const { error } = await addAppointment({
      client_id: form.client_id,
      service_id: form.service_id,
      date: form.date,
      start_time: form.start_time,
      notes: form.notes || undefined,
    });

    setIsSubmitting(false);

    if (error) {
      showToast(getErrorMessage(error), 'error');
    } else {
      showToast('Cita agendada correctamente', 'success');
      setIsModalOpen(false);
    }
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    const { error } = await updateStatus(id, status);
    if (error) {
      showToast(getErrorMessage(error), 'error');
    } else {
      showToast(`Estado actualizado a ${APPOINTMENT_STATUSES[status]}`, 'success');
      
      if (status === 'completed') {
        const appointment = appointments.find(a => a.id === id);
        if (appointment?.service) {
          await addExpense({
            concept: `Servicio: ${appointment.service.name}`,
            amount: appointment.service.price,
            category: 'other',
            expense_date: new Date().toISOString().split('T')[0],
            notes: `Cliente: ${appointment.client?.name}`,
          });
        }
      }
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
                    <span className="text-sm text-inverse">{appointment.client?.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-inverse/50" />
                    <span className="text-sm text-inverse/50">
                      {appointment.service?.name} - ${appointment.service?.price}
                    </span>
                  </div>

                  {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-surface-container-low">
                      {appointment.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(appointment.id, 'confirmed')}
                            className="flex-1 p-1.5 text-xs bg-success/15 text-success rounded hover:bg-success/25 transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => handleStatusChange(appointment.id, 'in_progress')}
                            className="flex-1 p-1.5 text-xs bg-info/15 text-info rounded hover:bg-info/25 transition-colors"
                          >
                            Iniciar
                          </button>
                        </>
                      )}
                      {appointment.status === 'confirmed' && (
                        <button
                          onClick={() => handleStatusChange(appointment.id, 'in_progress')}
                          className="flex-1 p-1.5 text-xs bg-info/15 text-info rounded hover:bg-info/25 transition-colors"
                        >
                          Iniciar
                        </button>
                      )}
                      {appointment.status === 'in_progress' && (
                        <button
                          onClick={() => handleStatusChange(appointment.id, 'completed')}
                          className="flex-1 p-1.5 text-xs bg-success/15 text-success rounded hover:bg-success/25 transition-colors"
                        >
                          Completar
                        </button>
                      )}
                      <button
                        onClick={() => handleStatusChange(appointment.id, 'cancelled')}
                        className="p-1.5 text-xs bg-error/15 text-error rounded hover:bg-error/25 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {(appointment.status === 'pending' || appointment.status === 'confirmed') && (
                    <button
                      onClick={() => openDeleteModal(appointment)}
                      className="w-full p-1.5 text-xs text-inverse/50 hover:text-error transition-colors"
                    >
                      Eliminar
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
          <Select
            label="Cliente"
            placeholder="Selecciona un cliente"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            error={errors.client_id}
            options={clients.map(c => ({ value: c.id, label: c.name }))}
          />

          <Select
            label="Servicio"
            placeholder="Selecciona un servicio"
            value={form.service_id}
            onChange={(e) => setForm({ ...form, service_id: e.target.value })}
            error={errors.service_id}
            options={services.map(s => ({ value: s.id, label: `${s.name} - $${s.price}` }))}
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
          ¿Estás seguro de eliminar esta cita? Esta acción no se puede deshacer.
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
    </div>
  );
}
