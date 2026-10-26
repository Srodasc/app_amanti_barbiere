import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { noStoreFetch } from '@/lib/supabase/no-store';

/**
 * Cliente con service role: IGNORA RLS. Solo para código de servidor que ya
 * verificó permisos (crear accesos de barbero, cron de WhatsApp).
 * Nunca importar desde componentes de cliente.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } }
  );
}
