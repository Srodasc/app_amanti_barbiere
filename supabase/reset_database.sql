-- =====================================================
-- BarberHub - Reset Completo de Base de Datos
-- ⚠️ ESTO BORRA TODOS LOS DATOS
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Borrar tablas existentes
DROP TABLE IF EXISTS public.reminders CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;
DROP TABLE IF EXISTS public.barber_schedules CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.barbers CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;

-- Borrar funciones
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLAS
-- =====================================================

CREATE TABLE public.admin_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_id uuid REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text DEFAULT 'owner' CHECK (role IN ('owner', 'manager')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.barbers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.admin_users ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  photo_url text,
  specialty text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.barber_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id uuid REFERENCES public.barbers ON DELETE CASCADE NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean DEFAULT true,
  appointment_duration integer DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  UNIQUE(barber_id, day_of_week)
);

CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_id uuid REFERENCES auth.users ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text UNIQUE,
  password_hash text,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.services (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.admin_users ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  price decimal(10,2) NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.appointments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.admin_users ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  barber_id uuid REFERENCES public.barbers ON DELETE SET NULL,
  service_id uuid REFERENCES public.services ON DELETE SET NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes text,
  client_name text,
  client_phone text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.admin_users ON DELETE CASCADE,
  concept text NOT NULL,
  amount decimal(10,2) NOT NULL,
  category text NOT NULL CHECK (category IN ('supplies', 'services', 'payroll', 'marketing', 'maintenance', 'other')),
  expense_date date NOT NULL,
  receipt_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.reminders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES public.admin_users ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date NOT NULL,
  due_time time,
  type text NOT NULL CHECK (type IN ('payment', 'purchase', 'payroll', 'appointment', 'custom')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  user_type text DEFAULT 'admin' CHECK (user_type IN ('admin', 'client')),
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Admin Users
CREATE POLICY "Admins manage own profile" ON public.admin_users
  FOR ALL USING (auth.uid() = auth_id);

-- Barbers
CREATE POLICY "Admins can manage own barbers" ON public.barbers
  FOR ALL USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

CREATE POLICY "Barbers are visible to admins and clients" ON public.barbers
  FOR SELECT USING (is_active = true);

-- Schedules
CREATE POLICY "Admins can manage schedules" ON public.barber_schedules
  FOR ALL USING (auth.uid() IN (
    SELECT a.auth_id FROM public.barbers b
    JOIN public.admin_users a ON b.admin_id = a.id
    WHERE a.is_active = true
  ));

CREATE POLICY "Schedules visible to admins" ON public.barber_schedules
  FOR SELECT USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

-- Clients
CREATE POLICY "Admins can manage clients" ON public.clients
  FOR ALL USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

-- Services
CREATE POLICY "Admins can manage services" ON public.services
  FOR ALL USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

CREATE POLICY "Active services visible to all" ON public.services
  FOR SELECT USING (is_active = true);

-- Appointments
CREATE POLICY "Admins can manage appointments" ON public.appointments
  FOR ALL USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

-- Expenses
CREATE POLICY "Admins can manage expenses" ON public.expenses
  FOR ALL USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

-- Reminders
CREATE POLICY "Admins can manage reminders" ON public.reminders
  FOR ALL USING (auth.uid() IN (SELECT auth_id FROM public.admin_users WHERE is_active = true));

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- =====================================================
-- TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');

  INSERT INTO public.admin_users (auth_id, name, email)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Admin'), new.email);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =====================================================
-- REALTIME
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_barbers_admin_id ON public.barbers(admin_id);
CREATE INDEX idx_barber_schedules_barber_id ON public.barber_schedules(barber_id);
CREATE INDEX idx_appointments_admin_id ON public.appointments(admin_id);
CREATE INDEX idx_appointments_date ON public.appointments(date);
CREATE INDEX idx_clients_auth_id ON public.clients(auth_id);
CREATE INDEX idx_services_admin_id ON public.services(admin_id);

-- =====================================================
-- SERVICIOS DE EJEMPLO
-- =====================================================

INSERT INTO public.services (name, duration_minutes, price, description) VALUES
  ('Corte de cabello', 30, 150.00, 'Corte clásico o moderno'),
  ('Afeitado completo', 20, 100.00, 'Afeitado con navaja'),
  ('Corte + Barba', 45, 250.00, 'Corte y arreglo de barba');
