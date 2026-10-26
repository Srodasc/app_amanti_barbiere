'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/**
 * Datos del negocio (tabla business_settings). Alimentan la Política de datos
 * (/privacidad), el botón "Cómo llegar" y las reglas de la reserva en línea.
 */
const FIELDS: { key: string; label: string; placeholder?: string; type?: string; group: 'negocio' | 'reserva' }[] = [
  { key: 'business_name', label: 'Nombre comercial', placeholder: 'Amanti Barbiere', group: 'negocio' },
  { key: 'legal_name', label: 'Razón social o nombre del propietario', group: 'negocio' },
  { key: 'legal_id', label: 'NIT o cédula', group: 'negocio' },
  { key: 'business_address', label: 'Dirección (se usa en "Cómo llegar")', placeholder: 'Calle 10 # 5-20, local 3', group: 'negocio' },
  { key: 'business_city', label: 'Ciudad', placeholder: 'Cali', group: 'negocio' },
  { key: 'business_phone', label: 'Teléfono / WhatsApp', type: 'tel', group: 'negocio' },
  { key: 'privacy_email', label: 'Correo para datos personales', type: 'email', group: 'negocio' },
  { key: 'privacy_policy_date', label: 'Política de datos vigente desde', type: 'date', group: 'negocio' },
  { key: 'max_days_ahead', label: 'Días hacia adelante para reservar', type: 'number', group: 'reserva' },
  { key: 'min_notice_hours', label: 'Horas mínimas de anticipación', type: 'number', group: 'reserva' },
  { key: 'cancel_before_hours', label: 'Horas antes para cancelar en línea', type: 'number', group: 'reserva' },
];

export default function BusinessSettingsCard() {
  const { showToast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    createClient()
      .from('business_settings')
      .select('key, value')
      .in('key', FIELDS.map((f) => f.key))
      .then(({ data }) => setValues(Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const email = values.privacy_email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('El correo no es válido.');
    for (const k of ['max_days_ahead', 'min_notice_hours', 'cancel_before_hours']) {
      const n = Number(values[k]);
      if (values[k] !== undefined && values[k] !== '' && (!Number.isInteger(n) || n < 0 || n > 365)) {
        return setError('Las reglas de reserva deben ser números enteros entre 0 y 365.');
      }
    }
    setSaving(true);
    const rows = FIELDS.filter((f) => values[f.key] !== undefined).map((f) => ({ key: f.key, value: (values[f.key] ?? '').trim() }));
    const { error } = await createClient().from('business_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) return setError(error.message);
    showToast('Datos del negocio guardados', 'success');
  };

  const field = (f: (typeof FIELDS)[number]) => (
    <Input
      key={f.key}
      label={f.label}
      type={f.type ?? 'text'}
      placeholder={f.placeholder}
      value={values[f.key] ?? ''}
      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
    />
  );

  return (
    <Card hover={false}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-primary mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-inverse">Datos del negocio</h2>
            <p className="text-sm text-inverse/60">
              Aparecen en la <a href="/privacidad" target="_blank" rel="noopener" className="text-primary underline">Política de datos</a> y en
              la confirmación de la reserva.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">{FIELDS.filter((f) => f.group === 'negocio').map(field)}</div>
        <h3 className="font-semibold text-inverse pt-2">Reglas de la reserva en línea</h3>
        <div className="grid sm:grid-cols-3 gap-4">{FIELDS.filter((f) => f.group === 'reserva').map(field)}</div>
        {error && <p className="text-sm text-error">{error}</p>}
        <Button type="submit" isLoading={saving}>Guardar datos</Button>
      </form>
    </Card>
  );
}
