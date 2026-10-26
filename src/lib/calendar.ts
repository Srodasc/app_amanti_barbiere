// "Agregar a mi calendario" y "Cómo llegar" para una cita (reserva y página de la cita).

export type CalendarEvent = {
  uid: string;
  date: string; // AAAA-MM-DD (hora local de Bogotá)
  time: string; // HH:MM
  minutes: number;
  title: string;
  details: string;
  location?: string | null;
};

/** Hora local de Bogotá (UTC−5, sin horario de verano) → sello UTC para calendarios */
export function toUtcStamp(date: string, time: string, plusMinutes = 0) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const ms = Date.UTC(y, mo - 1, d, h + 5, mi + plusMinutes);
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Descarga un .ics: lo abren el calendario del iPhone, Android y Outlook */
export function downloadIcs(ev: CalendarEvent) {
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amanti Barbiere//Reservas//ES',
    'BEGIN:VEVENT',
    `UID:${ev.uid}@amanti`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${toUtcStamp(ev.date, ev.time)}`,
    `DTEND:${toUtcStamp(ev.date, ev.time, ev.minutes)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(ev.details)}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(ev.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cita-amanti-barbiere.ics';
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(ev: CalendarEvent) {
  return (
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(ev.title)}` +
    `&dates=${toUtcStamp(ev.date, ev.time)}/${toUtcStamp(ev.date, ev.time, ev.minutes)}` +
    `&details=${encodeURIComponent(ev.details)}` +
    (ev.location ? `&location=${encodeURIComponent(ev.location)}` : '')
  );
}

export const mapsUrl = (address: string | null | undefined) =>
  address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
