/**
 * fetch sin caché para los clientes de Supabase del servidor.
 * Next 14 guarda en su "Data Cache" los fetch hechos en rutas de servidor, y eso
 * dejaba precios, servicios, horarios y citas congelados en la versión vieja.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });
