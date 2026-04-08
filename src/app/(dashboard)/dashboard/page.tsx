'use client';

import { useEffect, useState } from 'react';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Avatar } from '@/components/ui';
import { useAppointments, useClients, useExpenses } from '@/hooks';
import { formatCurrency, formatTime } from '@/lib/utils';
import { APPOINTMENT_STATUSES } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  pending: '#ed6c02',
  confirmed: '#0288d1',
  in_progress: '#7b1fa2',
  completed: '#2e7d32',
  cancelled: '#ba1a1a',
};

export default function DashboardPage() {
  const { appointments, getTodayAppointments, isLoading: appointmentsLoading } = useAppointments();
  const { clients, isLoading: clientsLoading } = useClients();
  const { expenses, getExpensesThisMonth, isLoading: expensesLoading } = useExpenses();
  const [revenueData, setRevenueData] = useState<{ name: string; ingresos: number; gastos: number }[]>([]);

  const todayAppointments = getTodayAppointments();
  const completedToday = todayAppointments.filter(a => a.status === 'completed').length;
  const totalRevenue = appointments
    .filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + (a.service?.price || 0), 0);
  const monthlyExpenses = getExpensesThisMonth().reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - monthlyExpenses;

  const appointmentsByStatus = [
    { name: 'Pendientes', value: appointments.filter(a => a.status === 'pending').length },
    { name: 'Confirmadas', value: appointments.filter(a => a.status === 'confirmed').length },
    { name: 'En Proceso', value: appointments.filter(a => a.status === 'in_progress').length },
    { name: 'Completadas', value: appointments.filter(a => a.status === 'completed').length },
  ];

  useEffect(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthName = date.toLocaleDateString('es-MX', { month: 'short' });
      const monthStr = date.toISOString().slice(0, 7);
      
      const monthAppointments = appointments.filter(a => 
        a.date.startsWith(monthStr) && a.status === 'completed'
      );
      const monthRevenue = monthAppointments.reduce((sum, a) => sum + (a.service?.price || 0), 0);
      
      const monthExpenses = expenses.filter(e => 
        e.expense_date.startsWith(monthStr)
      );
      const monthExpensesTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

      months.push({ 
        name: monthName, 
        ingresos: monthRevenue, 
        gastos: monthExpensesTotal 
      });
    }
    setRevenueData(months);
  }, [appointments, expenses]);

  const isLoading = appointmentsLoading || clientsLoading || expensesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-32">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-20 bg-surface-container-low rounded" />
                <div className="h-8 w-16 bg-surface-container-low rounded" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-heading font-bold text-inverse">Dashboard</h1>
        <p className="text-inverse/60">Resumen de tu barbería</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Citas de Hoy</p>
              <p className="text-3xl font-bold text-inverse mt-1">{todayAppointments.length}</p>
              <p className="text-xs text-success mt-1">{completedToday} completadas</p>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Clientes Totales</p>
              <p className="text-3xl font-bold text-inverse mt-1">{clients.length}</p>
              <p className="text-xs text-inverse/50 mt-1">Registrados</p>
            </div>
            <div className="w-12 h-12 bg-info/10 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-info" />
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Ingresos Totales</p>
              <p className="text-3xl font-bold text-inverse mt-1">{formatCurrency(totalRevenue)}</p>
              <p className="text-xs text-success mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Este mes
              </p>
            </div>
            <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-success" />
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-inverse/60">Ganancia Neta</p>
              <p className={`text-3xl font-bold mt-1 ${netProfit >= 0 ? 'text-success' : 'text-error'}`}>
                {formatCurrency(netProfit)}
              </p>
              <p className={`text-xs mt-1 flex items-center gap-1 ${monthlyExpenses > 0 ? 'text-error' : 'text-inverse/50'}`}>
                {monthlyExpenses > 0 ? (
                  <><TrendingDown className="w-3 h-3" /> {formatCurrency(monthlyExpenses)} gastos</>
                ) : (
                  'Sin gastos registrados'
                )}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${netProfit >= 0 ? 'bg-success/10' : 'bg-error/10'}`}>
              <TrendingUp className={`w-6 h-6 ${netProfit >= 0 ? 'text-success' : 'text-error'}`} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ingresos vs Gastos</CardTitle>
            <Link href="/dashboard/expenses" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
              Ver más <ArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebe4df" />
                  <XAxis dataKey="name" stroke="#313030" strokeOpacity={0.5} fontSize={12} />
                  <YAxis stroke="#313030" strokeOpacity={0.5} fontSize={12} tickFormatter={(v) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fcf9f8', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(49, 48, 48, 0.1)' }}
                    labelStyle={{ color: '#313030' }}
                    formatter={(value) => [formatCurrency(value as number), '']}
                  />
                  <Bar dataKey="ingresos" fill="#2e7d32" radius={[4, 4, 0, 0]} name="Ingresos" />
                  <Bar dataKey="gastos" fill="#ba1a1a" radius={[4, 4, 0, 0]} name="Gastos" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Estado de Citas</CardTitle>
            <Link href="/dashboard/appointments" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
              Ver más <ArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={appointmentsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {appointmentsByStatus.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={Object.values(STATUS_COLORS)[index % Object.values(STATUS_COLORS).length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fcf9f8', border: 'none', borderRadius: '8px' }}
                    labelStyle={{ color: '#313030' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {appointmentsByStatus.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-sm" 
                      style={{ backgroundColor: Object.values(STATUS_COLORS)[i] }}
                    />
                    <span className="text-sm text-inverse/60">{item.name}</span>
                    <span className="text-sm font-semibold text-inverse ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Citas de Hoy</CardTitle>
          <Link href="/dashboard/appointments" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
            Ver calendario <ArrowRight className="w-4 h-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {todayAppointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto text-inverse/30 mb-3" />
              <p className="text-inverse/60">No hay citas programadas para hoy</p>
              <Link href="/dashboard/appointments" className="text-primary hover:text-primary/80 text-sm mt-2 inline-block">
                Agendar nueva cita
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {todayAppointments.slice(0, 5).map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center gap-4 p-3 bg-surface-container-low rounded-lg"
                >
                  <div className="text-center min-w-[60px]">
                    <p className="text-lg font-bold text-primary">{formatTime(appointment.start_time)}</p>
                  </div>
                  <Avatar 
                    name={appointment.client?.name || appointment.client_name || 'Cliente'} 
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-inverse truncate">
                      {appointment.client?.name}
                    </p>
                    <p className="text-sm text-inverse/50">
                      {appointment.service?.name}
                    </p>
                  </div>
                  <Badge variant={
                    appointment.status === 'completed' ? 'success' :
                    appointment.status === 'in_progress' ? 'info' :
                    appointment.status === 'confirmed' ? 'accent' :
                    appointment.status === 'cancelled' ? 'error' : 'warning'
                  }>
                    {APPOINTMENT_STATUSES[appointment.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
