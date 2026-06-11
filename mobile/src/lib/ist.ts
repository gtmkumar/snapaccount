/**
 * IST (Asia/Kolkata) date/time formatting helpers — Wave 7.
 * All appointment / device-approval times render in IST with Western numerals
 * and Indian date convention DD/MM/YYYY (spec §1.2 / §4.2).
 */

const IST = 'Asia/Kolkata';

/** "10:30 AM" in IST. */
export function formatIstTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .toUpperCase();
}

/** "DD/MM/YYYY" in IST. */
export function formatIstDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "DD/MM/YYYY HH:mm" (24h) in IST — bookmarks / device meta. */
export function formatIstDateTime(iso: string): string {
  const d = new Date(iso);
  const date = formatIstDate(iso);
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${date} ${time}`;
}

/** Weekday short label in IST ("Mon"). */
export function formatIstWeekday(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'short',
  }).format(new Date(iso));
}

/** Day-of-month in IST ("17"). */
export function formatIstDayOfMonth(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
  }).format(new Date(iso));
}

/** IST hour (0–23) for part-of-day grouping of slots. */
export function getIstHour(iso: string): number {
  const h = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: 'numeric',
    hour12: false,
  }).format(new Date(iso));
  return parseInt(h, 10) % 24;
}

/** "mm:ss" countdown label from a millisecond delta (floored at 0). */
export function formatMmSs(deltaMs: number): string {
  const total = Math.max(0, Math.floor(deltaMs / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}
