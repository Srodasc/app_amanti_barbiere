'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, Calendar, Clock, User, LogOut, CalendarClock, AlertCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface Appointment {
  id: string;
  date: string;
  start_time: string;
  status: string;
  notes: string | null;
  service: { name: string; duration_minutes: number; price: number } | null;
  barber: { name: string } | null;
}

export default function ClientPortalPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [client, setClient] = useState<Client | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const sessionRes = await fetch('/api/clients/me');
      if (!sessionRes.ok) {
        router.push('/client-login');
        return;
      }
      const clientData = await sessionRes.json();
      setClient(clientData);

      const appointmentsRes = await fetch('/api/clients/appointments');
      const appointmentsData = await appointmentsRes.json();
      setAppointments(Array.isArray(appointmentsData) ? appointmentsData : []);
    } catch (error) {
      showToast('Error al cargar datos', 'error');
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await fetch('/api/clients/login', { method: 'DELETE' });
    router.push('/');
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta cita?')) return;

    try {
      const res = await fetch(`/api/clients/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, status: 'cancelled' }),
      });

      if (res.ok) {
        showToast('Cita cancelada', 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Error al cancelar', 'error');
      }
    } catch (error) {
      showToast('Error de conexión', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; text: string }> = {
      pending: { color: 'bg-yellow-500/20 text-yellow-500', text: 'Pendiente' },
      confirmed: { color: 'bg-blue-500/20 text-blue-500', text: 'Confirmada' },
      in_progress: { color: 'bg-purple-500/20 text-purple-500', text: 'En Proceso' },
      completed: { color: 'bg-green-500/20 text-green-500', text: 'Completada' },
      cancelled: { color: 'bg-red-500/20 text-red-500', text: 'Cancelada' },
    };
    const config = statusConfig[status] || { color: 'bg-gray-500/20 text-gray-500', text: status };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>{config.text}</span>;
  };

  const today = new Date().toISOString().split('T')[0];
  const upcomingAppointments = appointments.filter(a => a.date >= today && a.status !== 'cancelled');
  const pastAppointments = appointments.filter(a => a.date < today || a.status === 'cancelled');

  const displayedAppointments = activeTab === 'upcoming' ? upcomingAppointments : pastAppointments;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-pulse text-inverse/60">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-safe">
      <header className="bg-primary border-b border-surface-container-low">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
              <span className="text-lg sm:text-xl font-heading font-bold text-inverse">Amanti Barbiere</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 sm:gap-2 text-inverse/60 hover:text-inverse transition-colors p-2 touch-target"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline text-sm">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-heading font-bold text-inverse">Hola, {client?.name}</h1>
              <p className="text-sm text-inverse/60">{client?.phone}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <a href="/book" className="btn-primary flex-1 text-center text-sm sm:text-base py-2 sm:py-3">
              <Calendar className="w-4 h-4 mr-1 sm:mr-2 inline" />
              Nueva Cita
            </a>
          </div>
        </div>

        <div className="mb-4 sm:mb-6">
          <div className="flex gap-2 border-b border-surface-container-low overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'upcoming'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-inverse/60 hover:text-inverse'
              }`}
            >
              Próximas ({upcomingAppointments.length})
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-3 sm:px-4 py-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                activeTab === 'past'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-inverse/60 hover:text-inverse'
              }`}
            >
              Historial ({pastAppointments.length})
            </button>
          </div>
        </div>

        {displayedAppointments.length === 0 ? (
          <Card className="text-center py-8 sm:py-12">
            <CalendarClock className="w-12 h-12 sm:w-16 sm:h-16 text-inverse/60 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-sm sm:text-base text-inverse/60 mb-3 sm:mb-4">
              {activeTab === 'upcoming'
                ? 'No tienes citas programadas'
                : 'No tienes citas en el historial'}
            </p>
            {activeTab === 'upcoming' && (
              <a href="/book" className="btn-primary text-sm sm:text-base py-2 px-4 inline-block">
                Agenda tu primera cita
              </a>
            )}
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {displayedAppointments.map((appointment) => (
              <Card key={appointment.id} className="!p-3 sm:!p-4">
                <div className="flex items-start justify-between mb-2 sm:mb-3">
                  <div>
                    <h3 className="font-semibold text-inverse text-sm sm:text-base">{appointment.service?.name || 'Servicio'}</h3>
                    <p className="text-sm text-primary font-semibold">
                      ${appointment.service?.price || 0}
                    </p>
                  </div>
                  {getStatusBadge(appointment.status)}
                </div>

                <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-inverse/60 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>
                      {format(new Date(appointment.date), "EEEE d 'de' MMMM", { locale: es })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>
                      {appointment.start_time.slice(0, 5)} ({appointment.service?.duration_minutes || 30} min)
                    </span>
                  </div>
                  {appointment.barber && (
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>{appointment.barber.name}</span>
                    </div>
                  )}
                </div>

                {appointment.notes && (
                  <p className="text-xs sm:text-sm text-inverse/60 bg-surface-container-low p-2 rounded mb-3 sm:mb-4">
                    Nota: {appointment.notes}
                  </p>
                )}

                {activeTab === 'upcoming' && appointment.status !== 'cancelled' && (
                  <div className="flex gap-2 pt-2 sm:pt-3 border-t border-surface-container-low">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelAppointment(appointment.id)}
                      className="text-error hover:bg-error/10 text-xs sm:text-sm"
                    >
                      <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      Cancelar
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}