-- =====================================================
-- Fix: Agregar foreign keys faltantes en appointments
-- Ejecutar en Supabase SQL Editor
-- =====================================================

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_barber_id_fkey
  FOREIGN KEY (barber_id) REFERENCES public.barbers(id) ON DELETE SET NULL;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
