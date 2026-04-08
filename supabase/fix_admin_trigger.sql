-- =====================================================
-- Fix: Crear admin_users para usuarios existentes
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Actualizar trigger para que también cree admin_users
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

-- Crear admin_users para usuarios que ya existen pero no tienen registro
INSERT INTO public.admin_users (auth_id, name, email)
SELECT 
  au.id,
  coalesce(au.raw_user_meta_data->>'full_name', 'Admin'),
  au.email
FROM auth.users au
WHERE au.id NOT IN (SELECT auth_id FROM public.admin_users WHERE auth_id IS NOT NULL);
