/** "Andrés Gómez" → "andres-gomez" (para enlaces de reserva por barbero) */
export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Enlace público para reservar directo con un barbero */
export const barberBookingPath = (name: string) => `/book?barbero=${slugify(name)}`;
