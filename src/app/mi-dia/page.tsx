'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import AvailabilityExtras from '@/components/schedule/AvailabilityExtras';

type Row = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  service: { name: string } | { name: string }[] | null;
  client: { name: string; phone: string } | { name: string; phone: string }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

const ESTADOS: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmada', in_progress: 'En curso',
  completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió',
};

export default function MiDiaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'citas' | 'disponibilidad'>('citas');
  const [myBarberId, setMyBarberId] = useState<string | null>(null);

  useEffect(() => {
    // El barbero vinculado a esta sesión (un administrador puede no tener uno)
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('barbers').select('id').eq('auth_id', user.id).maybeSingle();
      setMyBarberId(data?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('id, date, start_time, end_time, status, notes, service:services(name), client:clients(name, phone)')
      .eq('date', date)
      .neq('status', 'cancelled')
      .order('start_time');
    if (error) setError(error.message);
    else setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    setError('');
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) setError(error.message);
    else load();
  };

  const salir = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <main className="min-h-screen bg-surface px-4 py-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading font-bold text-inverse">Mi día</h1>
          <Button variant="ghost" size="sm" onClick={salir}>Salir</Button>
        </div>
        <div className="flex gap-2 mb-4">
          {(['citas', 'disponibilidad'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded text-sm font-semibold ${tab === t ? 'bg-primary text-white' : 'bg-white text-inverse/70'}`}
            >
              {t === 'citas' ? 'Mis citas' : 'Mi disponibilidad'}
            </button>
          ))}
        </div>

        {tab === 'disponibilidad' ? (
          myBarberId ? (
            <AvailabilityExtras barberId={myBarberId} canEditBreaks={false} />
          ) : (
            <p className="text-inverse/60">Esta cuenta no está vinculada a un barbero. Gestiona la disponibilidad desde Dashboard → Barberos → Horarios.</p>
          )
        ) : (
        <>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full mb-1 rounded border border-inverse/20 px-3 py-2 bg-white"
        />
        <p className="text-sm text-inverse/60 mb-4 capitalize">
          {format(new Date(`${date}T00:00:00`), "EEEE d 'de' MMMM", { locale: es })}
        </p>
        {error && <p className="text-error text-sm mb-3">{error}</p>}
        {loading ? (
          <p className="text-inverse/60">Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="text-inverse/60">No tienes citas este día.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const c = one(r.client);
              const sv = one(r.service);
              const activa = ['pending', 'confirmed', 'in_progress'].includes(r.status);
              return (
                <li key={r.id} className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-lg">{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</p>
                      <p className="font-semibold">{c?.name ?? 'Cliente'}</p>
                      <p className="text-sm text-inverse/60">{sv?.name}</p>
                      {r.notes && <p className="text-sm mt-1">“{r.notes}”</p>}
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-inverse/10">{ESTADOS[r.status] ?? r.status}</span>
                  </div>
                  {activa && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {r.status !== 'in_progress' && <Button size="sm" variant="secondary" onClick={() => setStatus(r.id, 'in_progress')}>Iniciar</Button>}
                      <Button size="sm" onClick={() => setStatus(r.id, 'completed')}>Completar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'no_show')}>No llegó</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        </>
        )}
      </div>
    </main>
  );
}
