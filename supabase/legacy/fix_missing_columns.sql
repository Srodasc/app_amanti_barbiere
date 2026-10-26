-- =====================================================
-- Fix: Agregar admin_id y corregir foreign keys
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Agregar admin_id a appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE;

-- Agregar foreign keys faltantes
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_barber_id_fkey;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE SET NULL;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_service_id_fkey;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

-- Agregar admin_id a expenses si no existe
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE;

-- Agregar admin_id a reminders si no existe
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE;

-- Migrar datos existentes (opcional - copia user_id a admin_id si hay datos)
-- UPDATE public.appointments SET admin_id = (SELECT id FROM public.admin_users WHERE auth_id = appointments.user_id LIMIT 1) WHERE admin_id IS NULL;
