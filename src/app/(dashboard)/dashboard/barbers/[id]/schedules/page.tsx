'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Clock, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { useBarbers, useBarberSchedules } from '@/hooks';
import { Button, Input, Select, Modal, Card, Avatar, Skeleton } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { BarberSchedule, DayOfWeek, DAYS_OF_WEEK } from '@/types';
import type { Barber } from '@/types';

const emptyForm = {
  day_of_week: '' as DayOfWeek | '',
  start_time: '09:00',
  end_time: '18:00',
  appointment_duration: 30,
  is_available: true,
};

export default function BarberSchedulesPage() {
  const params = useParams();
  const router = useRouter();
  const barberId = params.id as string;
  const { showToast } = useToast();
  
  const { barbers, isLoading: isLoadingBarbers } = useBarbers();
  const { schedules, addSchedule, updateSchedule, deleteSchedule, isLoading: isLoadingSchedules, error: schedulesError } = useBarberSchedules(barberId);
  
  const [barber, setBarber] = useState<Barber | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BarberSchedule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (barbers.length > 0) {
      const found = barbers.find((b) => b.id === barberId);
      setBarber(found || null);
    }
  }, [barbers, barberId]);

  const getScheduleForDay = (day: DayOfWeek): BarberSchedule | undefined => {
    return schedules.find((s) => s.day_of_week === day);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.day_of_week) {
      newErrors.day_of_week = 'Selecciona un día';
    }
    if (!form.start_time) {
      newErrors.start_time = 'La hora de inicio es requerida';
    }
    if (!form.end_time) {
      newErrors.end_time = 'La hora de fin es requerida';
    }
    if (form.start_time >= form.end_time) {
      newErrors.end_time = 'La hora de fin debe ser mayor';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openCreateModal = (day?: DayOfWeek) => {
    setForm({ ...emptyForm, day_of_week: day || ('' as DayOfWeek | '') });
    setEditingSchedule(null);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (schedule: BarberSchedule) => {
    setForm({
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time.slice(0, 5),
      end_time: schedule.end_time.slice(0, 5),
      appointment_duration: schedule.appointment_duration,
      is_available: schedule.is_available,
    });
    setEditingSchedule(schedule);
    setErrors({});
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const scheduleData = {
      barber_id: barberId,
      day_of_week: form.day_of_week as DayOfWeek,
      start_time: form.start_time,
      end_time: form.end_time,
      appointment_duration: form.appointment_duration,
      is_available: form.is_available,
    };

    let result;
    if (editingSchedule) {
      result = await updateSchedule(editingSchedule.id, scheduleData);
    } else {
      result = await addSchedule(scheduleData);
    }

    setIsSubmitting(false);

    if (result.error) {
      showToast(result.error.message, 'error');
    } else {
      showToast(editingSchedule ? 'Horario actualizado' : 'Horario agregado', 'success');
      setIsModalOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSubmitting(true);
    const { error } = await deleteSchedule(id);
    setIsSubmitting(false);

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Horario eliminado', 'success');
    }
  };

  const toggleAvailability = async (schedule: BarberSchedule) => {
    const { error } = await updateSchedule(schedule.id, { is_available: !schedule.is_available });
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(schedule.is_available ? 'Día desactivado' : 'Día activado', 'success');
    }
  };

  if (isLoadingBarbers) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="w-48 h-6" />
            <Skeleton className="w-32 h-4" />
          </div>
        </div>
        <Card>
          <div className="space-y-4">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!barber) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-error" />
        <p className="text-inverse/60">Barbero no encontrado</p>
        <Button variant="ghost" onClick={() => router.push('/dashboard/barbers')}>
          Volver a Barberos
        </Button>
      </div>
    );
  }

  if (schedulesError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-error" />
        <p className="text-inverse/60">Error: {schedulesError}</p>
        <Button onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const dayOptions = Object.entries(DAYS_OF_WEEK).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/barbers')}
          className="p-2 text-inverse/60 hover:text-inverse hover:bg-surface-container-low rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4">
          <Avatar name={barber.name} src={barber.photo_url} size="lg" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-inverse">Horarios de {barber.name}</h1>
            {barber.specialty && (
              <p className="text-inverse/60">{barber.specialty}</p>
            )}
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-inverse">Días de Trabajo</h2>
            <p className="text-sm text-inverse/60">Configura los horarios de atención</p>
          </div>
          <Button onClick={() => openCreateModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Día
          </Button>
        </div>

        {isLoadingSchedules ? (
          <div className="space-y-4">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
        <div className="grid gap-4">
          {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) => {
            const schedule = getScheduleForDay(day);
            const isWorking = schedule?.is_available;

            return (
              <div
                key={day}
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  isWorking 
                    ? 'bg-surface border-accent/30' 
                    : 'bg-surface/50 border-surface-container-low'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center',
                      isWorking ? 'bg-primary/10' : 'bg-surface-container-low'
                    )}>
                      <Clock className={cn('w-6 h-6', isWorking ? 'text-primary' : 'text-inverse/60')} />
                    </div>
                    <div>
                      <p className={cn(
                        'font-semibold',
                        isWorking ? 'text-inverse' : 'text-inverse/60'
                      )}>
                        {DAYS_OF_WEEK[day]}
                      </p>
                      {schedule ? (
                        <p className="text-sm text-inverse/60">
                          {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                          <span className="mx-2">•</span>
                          {schedule.appointment_duration} min por cita
                        </p>
                      ) : (
                        <p className="text-sm text-inverse/60">No trabaja este día</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {schedule && (
                      <>
                        <button
                          onClick={() => toggleAvailability(schedule)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            schedule.is_available
                              ? 'bg-error/20 text-error hover:bg-error/30'
                              : 'bg-success/20 text-success hover:bg-success/30'
                          )}
                        >
                          {schedule.is_available ? 'Descansar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => openEditModal(schedule)}
                          className="p-2 text-inverse/60 hover:text-primary hover:bg-surface-container-low rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(schedule.id)}
                          className="p-2 text-inverse/60 hover:text-error hover:bg-surface-container-low rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {!schedule && (
                      <Button variant="ghost" size="sm" onClick={() => openCreateModal(day)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Agregar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSchedule ? 'Editar Horario' : 'Agregar Horario'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Día de la semana"
            placeholder="Selecciona un día"
            value={form.day_of_week}
            onChange={(e) => setForm({ ...form, day_of_week: parseInt(e.target.value) as DayOfWeek })}
            error={errors.day_of_week}
            options={dayOptions}
            disabled={!!editingSchedule}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Hora de inicio"
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              error={errors.start_time}
            />
            <Input
              label="Hora de fin"
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              error={errors.end_time}
            />
          </div>

          <Select
            label="Duración por cita (minutos)"
            value={form.appointment_duration.toString()}
            onChange={(e) => setForm({ ...form, appointment_duration: parseInt(e.target.value) })}
            options={[
              { value: '15', label: '15 minutos' },
              { value: '20', label: '20 minutos' },
              { value: '30', label: '30 minutos' },
              { value: '45', label: '45 minutos' },
              { value: '60', label: '60 minutos' },
            ]}
          />

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_available"
              checked={form.is_available}
              onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
              className="w-5 h-5 rounded border-surface-container-low bg-surface text-primary focus:ring-accent"
            />
            <label htmlFor="is_available" className="text-sm text-inverse/60 cursor-pointer">
              Disponible para citas
            </label>
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
              {editingSchedule ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
