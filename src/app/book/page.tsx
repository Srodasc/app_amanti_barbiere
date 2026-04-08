'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  Clock, 
  User, 
  Scissors, 
  ChevronLeft, 
  ChevronRight,
  Check,
  Phone,
  Mail
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, addDays, isSameMonth, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button, Input, Card, Avatar } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn, formatTime } from '@/lib/utils';
import { Service, Barber, BarberSchedule } from '@/types';

type BookingStep = 'service' | 'barber' | 'date' | 'time' | 'contact' | 'confirm';

export default function BookingPage() {
  const router = useRouter();
  const { showToast } = useToast();
  
  const [currentStep, setCurrentStep] = useState<BookingStep>('service');
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [schedules, setSchedules] = useState<Record<string, BarberSchedule[]>>({});
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Recargar citas cuando cambia el barbero seleccionado o la fecha
  useEffect(() => {
    const loadAppointments = async () => {
      try {
        const cacheBuster = Date.now();
        const appointmentsRes = await fetch(`/api/appointments?_=${cacheBuster}`).then(r => r.json());
        console.log('Loaded appointments:', appointmentsRes);
        
        if (Array.isArray(appointmentsRes)) {
          const booked = new Set<string>();
          appointmentsRes.forEach((apt: any) => {
            if (apt.status !== 'cancelled') {
              // Key: date_barberId_startTime
              const key = `${apt.date}_${apt.barber_id || 'any'}_${apt.start_time}`;
              console.log('Adding booked slot:', key);
              booked.add(key);
              
              // También agregar sin barbero para cuando no hay barbero seleccionado
              if (apt.barber_id) {
                booked.add(`${apt.date}_any_${apt.start_time}`);
              }
            }
          });
          console.log('Booked slots:', booked);
          setBookedSlots(booked);
        }
      } catch (error) {
        console.error('Error loading appointments:', error);
      }
    };
    loadAppointments();
  }, [selectedBarber, selectedDate]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const cacheBuster = Date.now();
      const [servicesRes, barbersRes, appointmentsRes] = await Promise.all([
        fetch(`/api/services?_=${cacheBuster}`).then(r => r.json()),
        fetch(`/api/barbers?_=${cacheBuster}`).then(r => r.json()),
        fetch(`/api/appointments?_=${cacheBuster}`).then(r => r.json()),
      ]);

      setServices(Array.isArray(servicesRes) ? servicesRes : []);
      
      if (Array.isArray(barbersRes)) {
        setBarbers(barbersRes);
        
        // Cargar horarios de cada barbero
        const schedulesMap: Record<string, BarberSchedule[]> = {};
        const cacheBuster = Date.now();
        for (const barber of barbersRes) {
          try {
            const schedRes = await fetch(`/api/barbers/${barber.id}/schedules?_=${cacheBuster}`);
            const schedData = await schedRes.json();
            schedulesMap[barber.id] = Array.isArray(schedData) ? schedData : [];
          } catch (e) {
            console.error(`Error loading schedules for barber ${barber.id}:`, e);
            schedulesMap[barber.id] = [];
          }
        }
        setSchedules(schedulesMap);
      } else {
        setBarbers([]);
      }

      // Cargar citas existentes para bloquear horarios ocupados
      if (Array.isArray(appointmentsRes)) {
        const booked = new Set<string>();
        appointmentsRes.forEach((apt: any) => {
          if (apt.status !== 'cancelled') {
            // Key con barbero específico
            const key = `${apt.date}_${apt.barber_id || 'any'}_${apt.start_time}`;
            booked.add(key);
            
            // También bloquear "any" cuando hay barbero específico
            if (apt.barber_id) {
              booked.add(`${apt.date}_any_${apt.start_time}`);
            }
          }
        });
        setBookedSlots(booked);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('Error al cargar datos', 'error');
    }
    setIsLoading(false);
  };

  const isWorkingDay = (barber: Barber | null, date: Date): boolean => {
    // Si no hay barbero seleccionado, cualquier día es válido (cualquier barbero disponible)
    if (!barber) return true;
    
    const dayOfWeek = date.getDay();
    const barberSchedules = schedules[barber.id] || [];
    const isWorking = barberSchedules.some(
      (s) => s.day_of_week === dayOfWeek && s.is_available
    );
    
    console.log(`Checking working day for barber ${barber.id} on day ${dayOfWeek}:`, isWorking, 'schedules:', barberSchedules);
    return isWorking;
  };

  const getAvailableSlots = (barber: Barber | null, date: Date | null): string[] => {
    if (!date) return [];
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayOfWeek = date.getDay();
    let barberSchedules: BarberSchedule[] = [];
    
    if (barber) {
      barberSchedules = schedules[barber.id] || [];
    } else {
      // Si no hay barbero seleccionado, buscar cualquier barbero disponible
      for (const b of barbers) {
        barberSchedules = [...barberSchedules, ...(schedules[b.id] || [])];
      }
    }
    
    const daySchedule = barberSchedules.find(
      (s) => s.day_of_week === dayOfWeek && s.is_available
    );
    
    if (!daySchedule) return [];
    
    // Normalizar hora del schedule
    const normalizeTime = (t: string) => {
      const [h, m] = t.split(':');
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    };
    
    const duration = selectedService?.duration_minutes || 30;
    const slots: string[] = [];
    let [h, m] = normalizeTime(daySchedule.start_time).split(':').map(Number);
    const [endH, endM] = normalizeTime(daySchedule.end_time).split(':').map(Number);
    
    while (h * 60 + m < endH * 60 + endM) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      
      // Normalizar a HH:mm:ss para сравнение con la base de datos
      const timeKey = `${timeStr}:00`;
      
      // Verificar si el horario está ocupado
      const barberIdKey = barber?.id || 'any';
      const keyWithBarber = `${dateStr}_${barberIdKey}_${timeKey}`;
      const keyAny = `${dateStr}_any_${timeKey}`;
      
      // Verificar también sin segundos
      const keyWithBarberShort = `${dateStr}_${barberIdKey}_${timeStr}`;
      const keyAnyShort = `${dateStr}_any_${timeStr}`;
      
      const isBooked = bookedSlots.has(keyWithBarber) || 
                       bookedSlots.has(keyWithBarberShort) ||
                       bookedSlots.has(keyAny) ||
                       bookedSlots.has(keyAnyShort) ||
                       (!barber && barbers.some(b => 
                         bookedSlots.has(`${dateStr}_${b.id}_${timeKey}`) ||
                         bookedSlots.has(`${dateStr}_${b.id}_${timeStr}`)
                       ));
      
      if (!isBooked) {
        slots.push(timeStr);
      }
      
      m += duration;
      if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
      }
    }
    
    return slots;
  };

  const goNext = () => {
    const steps: BookingStep[] = ['service', 'barber', 'date', 'time', 'contact'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const goBack = () => {
    const steps: BookingStep[] = ['service', 'barber', 'date', 'time', 'contact'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const validateContact = () => {
    const newErrors: Record<string, string> = {};
    if (!contactForm.name || contactForm.name.length < 2) {
      newErrors.name = 'El nombre es requerido';
    }
    if (!contactForm.phone || contactForm.phone.length < 10) {
      newErrors.phone = 'El teléfono es requerido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateContact()) return;
    if (!selectedService || !selectedDate || !selectedTime) return;

    setIsSubmitting(true);
    
    try {
      // Calcular hora fin
      const [h, m] = selectedTime.split(':').map(Number);
      const duration = selectedService.duration_minutes;
      const totalMinutes = h * 60 + m + duration;
      const endTime = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;

      // Crear cita (el API maneja la creación del cliente automáticamente)
      const appointmentRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedService.id,
          barber_id: selectedBarber?.id || null,
          date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: selectedTime,
          end_time: endTime,
          client_name: contactForm.name,
          client_phone: contactForm.phone,
          notes: contactForm.notes || null,
        }),
      });

      const appointmentData = await appointmentRes.json();

      if (!appointmentRes.ok) {
        showToast(appointmentData.error || 'Error al agendar', 'error');
        setIsSubmitting(false);
        return;
      }

      // Actualizar slots ocupados localmente
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const barberIdKey = selectedBarber?.id || 'any';
      const newBooked = new Set(bookedSlots);
      newBooked.add(`${dateStr}_${barberIdKey}_${selectedTime}`);
      setBookedSlots(newBooked);

      showToast('¡Cita agendada exitosamente!', 'success');
      setCurrentStep('confirm');
    } catch (error) {
      showToast('Error de conexión', 'error');
    }
    
    setIsSubmitting(false);
  };

  const generateCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDate = addDays(monthStart, -monthStart.getDay());
    const endDate = addDays(monthEnd, 6 - monthEnd.getDay());
    
    const days = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  };

  const calendarDays = generateCalendarDays();
  const availableSlots = getAvailableSlots(selectedBarber, selectedDate);

  return (
    <div className="min-h-screen bg-surface pb-safe">
      <header className="bg-primary border-b border-surface-container-low">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Scissors className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <span className="text-lg sm:text-lg sm:text-xl font-heading font-bold text-inverse">Amanti Barbiere</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-inverse mb-2">Agenda tu Cita</h1>
          <p className="text-sm sm:text-base text-inverse/60">Selecciona el servicio, barbero y horario</p>
        </div>

        <Card className="max-w-2xl mx-auto !p-4 sm:!p-6">
          {/* Service Selection */}
          {currentStep === 'service' && (
            <div className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-inverse mb-4">¿Qué servicio necesitas?</h2>
              {isLoading ? (
                <div className="text-center py-8 text-inverse/60">Cargando...</div>
              ) : services.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-inverse/60 mb-4">No hay servicios disponibles</p>
                  <Button variant="secondary" onClick={loadData}>Reintentar</Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => { setSelectedService(service); goNext(); }}
                      className={cn(
                        'p-4 rounded-lg border text-left transition-all',
                        selectedService?.id === service.id
                          ? 'border-primary bg-primary/10'
                          : 'border-surface-container-low bg-surface hover:border-primary/50'
                      )}
                    >
                      <div className="flex justify-between">
                        <div>
                          <p className="font-semibold text-inverse">{service.name}</p>
                          {service.description && (
                            <p className="text-sm text-inverse/60 mt-1">{service.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-sm text-inverse/60">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {service.duration_minutes} min
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg sm:text-xl font-bold text-primary">${service.price}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Barber Selection */}
          {currentStep === 'barber' && (
            <div className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-inverse mb-4">¿Prefieres algún barbero?</h2>
              <button
                onClick={() => { setSelectedBarber(null); goNext(); }}
                className={cn(
                  'w-full p-4 rounded-lg border text-left transition-all',
                  !selectedBarber
                    ? 'border-primary bg-primary/10'
                    : 'border-surface-container-low bg-surface hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-inverse">Sin preferencia</p>
                    <p className="text-sm text-inverse/60">Te asignamos el primero disponible</p>
                  </div>
                </div>
              </button>
              {barbers.map((barber) => (
                <button
                  key={barber.id}
                  onClick={() => { setSelectedBarber(barber); goNext(); }}
                  className={cn(
                    'w-full p-4 rounded-lg border text-left transition-all',
                    selectedBarber?.id === barber.id
                      ? 'border-primary bg-primary/10'
                      : 'border-surface-container-low bg-surface hover:border-primary/50'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <Avatar name={barber.name} src={barber.photo_url} size="lg" />
                    <div>
                      <p className="font-semibold text-inverse">{barber.name}</p>
                      {barber.specialty && (
                        <p className="text-sm text-primary">{barber.specialty}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              <div className="pt-4">
                <Button variant="secondary" onClick={goBack} className="w-full">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Volver
                </Button>
              </div>
            </div>
          )}

          {/* Date Selection */}
          {currentStep === 'date' && (
            <div className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-inverse mb-4">Selecciona una fecha</h2>
              
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-inverse/60 hover:text-inverse">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-lg font-semibold text-inverse capitalize">
                  {format(currentMonth, 'MMMM yyyy', { locale: es })}
                </h3>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-inverse/60 hover:text-inverse">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-inverse/60 py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  const isPast = day < new Date() && !isToday(day);
                  const workingDay = isWorkingDay(selectedBarber, day);
                  
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (!isPast && workingDay) {
                          setSelectedDate(day);
                          goNext();
                        }
                      }}
                      disabled={isPast || !workingDay}
                      className={cn(
                        'p-2 rounded-lg text-sm transition-all aspect-square flex items-center justify-center',
                        !isSameMonth(day, currentMonth) && 'text-inverse/30',
                        isPast && 'text-inverse/50 cursor-not-allowed',
                        !isPast && !workingDay && 'text-inverse/50 cursor-not-allowed',
                        isToday(day) && selectedDate?.toDateString() !== day.toDateString() && 'bg-surface-container-low',
                        selectedDate && selectedDate.toDateString() === day.toDateString() && 'bg-primary text-surface font-semibold',
                        !isPast && workingDay && isSameMonth(day, currentMonth) && selectedDate?.toDateString() !== day.toDateString() && 'hover:bg-surface-container-low text-inverse'
                      )}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Volver
                </Button>
                <Button onClick={goNext} disabled={!selectedDate} className="flex-1">
                  Continuar
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Time Selection */}
          {currentStep === 'time' && (
            <div className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-inverse mb-4">
                Selecciona una hora
                {selectedDate && (
                  <span className="block text-sm font-normal text-inverse/60 mt-1">
                    {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                )}
              </h2>

              {isLoading ? (
                <div className="text-center py-8 text-inverse/60">Cargando...</div>
              ) : availableSlots.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-inverse/60 mb-4">No hay horarios disponibles</p>
                  <Button variant="secondary" onClick={goBack}>Cambiar fecha</Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => { setSelectedTime(slot); goNext(); }}
                      className={cn(
                        'p-3 rounded-lg text-center font-medium transition-all',
                        selectedTime === slot
                          ? 'bg-accent text-primary'
                          : 'bg-surface border border-surface-container-low hover:border-primary text-inverse'
                      )}
                    >
                      {formatTime(slot)}
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-4">
                <Button variant="secondary" onClick={goBack} className="w-full">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Volver
                </Button>
              </div>
            </div>
          )}

          {/* Contact Form */}
          {currentStep === 'contact' && (
            <div className="space-y-4">
              <h2 className="text-lg sm:text-xl font-semibold text-inverse mb-4">Tus datos de contacto</h2>
              
              <Input
                label="Nombre completo"
                placeholder="Tu nombre"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                error={errors.name}
                icon={<User className="w-4 h-4" />}
              />

              <Input
                label="Teléfono"
                type="tel"
                placeholder="+52 123 456 7890"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                error={errors.phone}
                icon={<Phone className="w-4 h-4" />}
              />

              <Input
                label="Correo electrónico (opcional)"
                type="email"
                placeholder="tu@email.com"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                icon={<Mail className="w-4 h-4" />}
              />

              <div>
                <label className="block text-sm font-medium text-inverse/60 mb-2">
                  Notas (opcional)
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  placeholder="Alguna preferencia..."
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Volver
                </Button>
                <Button onClick={() => validateContact() && goNext()} className="flex-1">
                  Revisar
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Summary */}
          {(currentStep === 'contact' || currentStep === 'time') && (
            <div className="mt-6 p-4 bg-surface rounded-lg border border-surface-container-low">
              <h3 className="font-semibold text-inverse mb-3">Resumen</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-inverse/60">Servicio:</span>
                  <span className="text-inverse">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-inverse/60">Precio:</span>
                  <span className="text-primary font-semibold">${selectedService?.price}</span>
                </div>
                {selectedBarber && (
                  <div className="flex justify-between">
                    <span className="text-inverse/60">Barbero:</span>
                    <span className="text-inverse">{selectedBarber.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-inverse/60">Fecha:</span>
                  <span className="text-inverse">
                    {selectedDate && format(selectedDate, "d 'de' MMMM", { locale: es })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-inverse/60">Hora:</span>
                  <span className="text-inverse">{selectedTime && formatTime(selectedTime)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          {currentStep === 'contact' && (
            <div className="pt-4">
              <Button onClick={handleSubmit} isLoading={isSubmitting} className="w-full" size="lg">
                <Check className="w-5 h-5 mr-2" />
                Confirmar Cita
              </Button>
            </div>
          )}

          {/* Success */}
          {currentStep === 'confirm' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-2xl font-heading font-bold text-inverse mb-2">¡Cita Agendada!</h2>
              <p className="text-inverse/60 mb-6">
                Te esperamos el {selectedDate && format(selectedDate, "d 'de' MMMM", { locale: es })} a las {selectedTime && formatTime(selectedTime)}
              </p>
              <Button onClick={() => router.push('/')}>
                Volver al inicio
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
