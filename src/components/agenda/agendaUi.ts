// Colores y textos de estado de la agenda (contraste ≥ 4.5:1 sobre su fondo).
export const STATUS_UI: Record<string, { label: string; bg: string; border: string; text: string; dashed?: boolean }> = {
  pending: { label: 'Pendiente', bg: '#fff4e5', border: '#f0b56a', text: '#663c00' },
  confirmed: { label: 'Confirmada', bg: '#f5f0e8', border: '#d4be8f', text: '#453410' },
  in_progress: { label: 'En curso', bg: '#e3eef9', border: '#8db5dd', text: '#0b3d6b' },
  completed: { label: 'Completada', bg: '#e7f2e8', border: '#9cc8a0', text: '#1d4d21' },
  no_show: { label: 'No llegó', bg: '#f0eeed', border: '#cfc8c4', text: '#5a5a5a', dashed: true },
  cancelled: { label: 'Cancelada', bg: '#fbeaea', border: '#e3a9a9', text: '#7a1c1c', dashed: true },
};

export const OPEN_STATUSES = ['pending', 'confirmed', 'in_progress'];

export const HATCH =
  'repeating-linear-gradient(135deg, #f5f0ed 0, #f5f0ed 8px, #fcf9f8 8px, #fcf9f8 16px)';

export const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

/** Filtro de estado de la barra de herramientas */
export type StatusFilter = 'all' | 'open' | 'completed' | 'no_show' | 'cancelled';
export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas (sin canceladas)' },
  { value: 'open', label: 'Por atender' },
  { value: 'completed', label: 'Completadas' },
  { value: 'no_show', label: 'No llegaron' },
  { value: 'cancelled', label: 'Canceladas' },
];
export function matchesStatus(status: string, f: StatusFilter) {
  if (f === 'all') return status !== 'cancelled';
  if (f === 'open') return OPEN_STATUSES.includes(status);
  return status === f;
}
