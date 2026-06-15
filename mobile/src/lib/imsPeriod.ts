/**
 * IMS period + date helpers (Indian conventions).
 * Spec: docs/design/ims-inbox-spec.md §2.1, §4, §13.
 *
 * - API period format: MMYYYY ("032026" = March 2026).
 * - GSTR-2B for period m is generated on the 14th of month m+1 (statutory).
 * - The "current open period" is the latest month whose deemed-acceptance
 *   deadline (14th of the following month) has not yet passed.
 */

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Parse MMYYYY → { month: 1-12, year } or null when malformed. */
export function parsePeriod(period: string): { month: number; year: number } | null {
  if (!/^\d{6}$/.test(period)) return null;
  const month = Number(period.slice(0, 2));
  const year = Number(period.slice(2));
  if (month < 1 || month > 12) return null;
  return { month, year };
}

/** "032026" → "March 2026". Returns the raw input when malformed. */
export function periodToLabel(period: string): string {
  const parsed = parsePeriod(period);
  if (!parsed) return period;
  return `${MONTH_LABELS[parsed.month - 1]} ${parsed.year}`;
}

/** "032026" → "Mar 2026". Returns the raw input when malformed. */
export function periodToShortLabel(period: string): string {
  const parsed = parsePeriod(period);
  if (!parsed) return period;
  return `${MONTH_SHORT[parsed.month - 1]} ${parsed.year}`;
}

/** Build MMYYYY from a 1-based month + year. */
export function toPeriod(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}${year}`;
}

/**
 * GSTR-2B generation deadline for a period — the 14th of the following month.
 * Mirrors GetImsSummaryQueryHandler.ComputeGstr2bDeadline.
 */
export function gstr2bDeadline(period: string): Date | null {
  const parsed = parsePeriod(period);
  if (!parsed) return null;
  const nextMonth = parsed.month === 12 ? 1 : parsed.month + 1;
  const nextYear = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  return new Date(nextYear, nextMonth - 1, 14);
}

/**
 * The latest period whose GSTR-2B deadline has not passed:
 * up to and including the 14th, the previous month is still actionable;
 * after the 14th, the action window moves to the current month's period.
 */
export function currentOpenImsPeriod(now: Date = new Date()): string {
  if (now.getDate() <= 14) {
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth is 0-based
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return toPeriod(prevMonth, prevYear);
  }
  return toPeriod(now.getMonth() + 1, now.getFullYear());
}

/** Last `n` periods (MMYYYY), newest first, starting from the open period. */
export function lastPeriods(n: number, now: Date = new Date()): string[] {
  const open = parsePeriod(currentOpenImsPeriod(now));
  if (!open) return [];
  const out: string[] = [];
  let { month, year } = open;
  for (let i = 0; i < n; i++) {
    out.push(toPeriod(month, year));
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

/** Whole days from today (midnight-to-midnight) until an ISO date. */
export function daysUntilDate(iso: string, now: Date = new Date()): number {
  const target = new Date(iso);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** ISO date → "15/03/2026" (list convention). */
export function formatDateDDMMYYYY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** ISO date → "15 Mar 2026" (detail/banner convention). */
export function formatDateDDMMMYYYY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISO timestamp → "11 Jun 2026, 14:30" in IST (Asia/Kolkata). */
export function formatTimestampIST(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return String(iso);
  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')}`;
  } catch {
    // Older JS engines without full Intl timezone data
    return `${formatDateDDMMMYYYY(d.toISOString())}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
