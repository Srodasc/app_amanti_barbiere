'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { Button, Card, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';

/**
 * Datos del negocio (tabla business_settings). Alimentan la Política de datos
 * (/privacidad), el botón "Cómo llegar" y las reglas de la reserva en línea.
 */
type Field = {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  group: 'negocio' | 'reserva';
  options?: { value: string; label: string }[];
  showIf?: (v: Record<string, string>) => boolean;
};
const FIELDS: Field[] = [
  { key: 'business_name', label: 'Nombre comercial', placeholder: 'Amanti Barbiere', group: 'negocio' },
  { key: 'legal_name', label: 'Razón social o nombre del propietario', group: 'negocio' },
  { key: 'legal_id', label: 'NIT o cédula', group: 'negocio' },
  { key: 'business_address', label: 'Dirección (se usa en "Cómo llegar")', placeholder: 'Calle 10 # 5-20, local 3', group: 'negocio' },
  { key: 'business_city', label: 'Ciudad', placeholder: 'Cali', group: 'negocio' },
  { key: 'business_phone', label: 'Teléfono / WhatsApp', type: 'tel', group: 'negocio' },
  { key: 'privacy_email', label: 'Correo para datos personales', type: 'email', group: 'negocio' },
  { key: 'privacy_policy_date', label: 'Política de datos vigente desde', type: 'date', group: 'negocio' },
  {
    key: 'booking_window',
    label: 'Hasta cuándo pueden reservar los clientes',
    group: 'reserva',
    options: [
      { value: 'days', label: 'Un número de días que se va abriendo día a día' },
      { value: 'week', label: 'Solo la semana en curso (hasta el domingo)' },
    ],
  },
  // Se muestra como "días que ve el cliente, incluido hoy" (= max_days_ahead + 1) para evitar confusiones
  { key: 'max_days_ahead', label: 'Días que el cliente puede ver (incluido hoy)', type: 'number', group: 'reserva', showIf: (v) => v.booking_window !== 'week' },
  { key: 'min_notice_hours', label: 'Horas mínimas de anticipación', type: 'number', group: 'reserva' },
  { key: 'cancel_before_hours', label: 'Horas antes para cancelar o cambiar en línea', type: 'number', group: 'reserva' },
  { key: 'max_client_reschedules', label: 'Veces que el cliente puede cambiar su cita', type: 'number', group: 'reserva' },
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
      .then(({ data }) => {
        const v: Record<string, string> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']));
        // En pantalla: días que ve el cliente incluido hoy (guardado: días además de hoy)
        if (v.max_days_ahead !== undefined && v.max_days_ahead !== '') v.max_days_ahead = String(Number(v.max_days_ahead) + 1);
        setValues(v);
      });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const email = values.privacy_email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('El correo no es válido.');
    const shown = Number(values.max_days_ahead);
    if (values.max_days_ahead !== undefined && (!Number.isInteger(shown) || shown < 1 || shown > 366)) {
      return setError('Los días que ve el cliente deben estar entre 1 y 366.');
    }
    for (const k of ['min_notice_hours', 'cancel_before_hours', 'max_client_reschedules']) {
      const n = Number(values[k]);
      if (values[k] !== undefined && values[k] !== '' && (!Number.isInteger(n) || n < 0 || n > 365)) {
        return setError('Las reglas de reserva deben ser números enteros entre 0 y 365.');
      }
    }
    setSaving(true);
    const rows = FIELDS.filter((f) => values[f.key] !== undefined).map((f) => ({
      key: f.key,
      value: f.key === 'max_days_ahead' ? String(Number(values[f.key]) - 1) : (values[f.key] ?? '').trim(),
    }));
    const { error } = await createClient().from('business_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) return setError(error.message);
    showToast('Datos del negocio guardados', 'success');
  };

  const field = (f: Field) =>
    f.showIf && !f.showIf(values) ? null : f.options ? (
      values[f.key] === undefined ? null : (
        <div key={f.key} className="sm:col-span-3">
          <label htmlFor={`set-${f.key}`} className="block text-sm font-medium text-inverse/70 mb-2">
            {f.label}
          </label>
          <select
            id={`set-${f.key}`}
            className="input-field"
            value={values[f.key]}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {values[f.key] === 'week' && (
            <p className="text-xs text-inverse/60 mt-1">
              Cada lunes se abre la semana nueva. El personal puede agendar más adelante desde el panel.
            </p>
          )}
        </div>
      )
    ) : (
    <div key={f.key}>
      <Input
        label={f.label}
        type={f.type ?? 'text'}
        placeholder={f.placeholder}
        value={values[f.key] ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
      />
      {f.key === 'max_days_ahead' && Number(values.max_days_ahead) >= 1 && (
        <p className="text-xs text-inverse/60 mt-1">
          Hoy pueden reservar hasta el {format(addDays(new Date(), Number(values.max_days_ahead) - 1), "EEEE d 'de' MMMM", { locale: es })}. Cada día se abre uno nuevo.
        </p>
      )}
    </div>
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
