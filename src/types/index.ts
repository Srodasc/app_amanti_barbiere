// =====================================================
// BarberHub - TypeScript Types (v2)
// =====================================================

// Admin User (dueño/gerente de barbería)
export interface AdminUser {
  id: string;
  auth_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: 'owner' | 'manager';
  is_active: boolean;
  created_at: string;
}

// Barber (barbero)
export interface Barber {
  id: string;
  admin_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  specialty: string | null;
  is_active: boolean;
  created_at: string;
  schedules?: BarberSchedule[];
}

// Barber Schedule (horario de trabajo)
export interface BarberSchedule {
  id: string;
  barber_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  is_available: boolean;
  appointment_duration: number;
  created_at: string;
}

// Client (cliente que reserva)
export interface Client {
  id: string;
  auth_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  is_verified: boolean;
  created_at: string;
}

// Service (servicio de barbería)
export interface Service {
  id: string;
  admin_id: string | null;
  name: string;
  duration_minutes: number;
  price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// Appointment (cita)
export interface Appointment {
  id: string;
  admin_id: string | null;
  client_id: string | null;
  barber_id: string | null;
  service_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  client_name: string | null;
  client_phone: string | null;
  created_at: string;
  client?: Client;
  barber?: Barber;
  service?: Service;
}

// Expense (gasto)
export interface Expense {
  id: string;
  admin_id: string | null;
  concept: string;
  amount: number;
  category: ExpenseCategory;
  expense_date: string;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
}

// Reminder (recordatorio)
export interface Reminder {
  id: string;
  admin_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  type: ReminderType;
  priority: ReminderPriority;
  is_completed: boolean;
  created_at: string;
}

// Profile (usuario de auth)
export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  user_type: 'admin' | 'client';
  created_at: string;
}

// =====================================================
// ENUMS
// =====================================================

export type AppointmentStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled';

export type ExpenseCategory = 
  | 'supplies'
  | 'services'
  | 'payroll'
  | 'marketing'
  | 'maintenance'
  | 'other';

export type ReminderType = 
  | 'payment'
  | 'purchase'
  | 'payroll'
  | 'appointment'
  | 'custom';

export type ReminderPriority = 'low' | 'medium' | 'high';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type UserType = 'admin' | 'client';

export type AdminRole = 'owner' | 'manager';

// =====================================================
// CONSTANTS
// =====================================================

export const DAYS_OF_WEEK: Record<DayOfWeek, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  supplies: 'Insumos/Restock',
  services: 'Servicios (luz, agua, internet)',
  payroll: 'Nómina',
  marketing: 'Marketing',
  maintenance: 'Mantenimiento',
  other: 'Otros',
};

export const APPOINTMENT_STATUSES: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  in_progress: 'En Proceso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const REMINDER_TYPES: Record<ReminderType, string> = {
  payment: 'Pago',
  purchase: 'Compra',
  payroll: 'Nómina',
  appointment: 'Cita',
  custom: 'Personalizado',
};

export const REMINDER_PRIORITIES: Record<ReminderPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

// =====================================================
// TYPES FOR BOOKING
// =====================================================

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface BookingFormData {
  service_id: string;
  barber_id: string | null;
  date: string;
  time: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  notes?: string;
}

export interface DashboardStats {
  appointmentsToday: number;
  clientsThisMonth: number;
  revenueThisMonth: number;
  expensesThisMonth: number;
  netProfit: number;
}

export interface ChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

// =====================================================
// LEGACY TYPES (for backwards compatibility)
// =====================================================

export interface ClientLegacy {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
