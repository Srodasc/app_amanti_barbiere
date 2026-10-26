-- =====================================================
-- Fix: Recursión infinita en barber_schedules policy
-- Ejecutar en Supabase SQL Editor
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage schedules" ON public.barber_schedules;

CREATE POLICY "Admins can manage schedules" ON public.barber_schedules
  FOR ALL USING (auth.uid() IN (
    SELECT a.auth_id FROM public.barbers b
    JOIN public.admin_users a ON b.admin_id = a.id
    WHERE a.is_active = true
  ));
