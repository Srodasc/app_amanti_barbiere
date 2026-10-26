// Celular como identificador del cliente. Debe coincidir con normalize_phone() de la base de datos.

/** Solo dígitos; un celular colombiano de 10 dígitos (3xx…) recibe el 57 delante. */
export function normalizePhone(input: string | null | undefined): string {
  const d = (input ?? '').replace(/\D/g, '');
  return /^3\d{9}$/.test(d) ? `57${d}` : d;
}

/** ¿Sirve para identificar a un cliente? (celular de 10 a 15 dígitos ya normalizado) */
export const isValidMobile = (input: string | null | undefined) => /^\d{10,15}$/.test(normalizePhone(input));

/** 573001234567 → "+57 300 123 4567" (otros formatos se muestran tal cual) */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone === 'mostrador') return 'Mostrador';
  const m = /^57(3\d{2})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** Últimos 4 dígitos, para confirmar en persona ("¿tu número termina en 4567?") */
export const lastDigits = (phone: string | null | undefined, n = 4) => (phone ?? '').replace(/\D/g, '').slice(-n);
