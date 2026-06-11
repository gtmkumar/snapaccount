/**
 * noticeStatus — canonical notice workflow statuses + shared helpers.
 *
 * Server canon (GST + ITR notice engines): RECEIVED → UNDER_REVIEW →
 * RESPONDED → CLOSED. "Overdue" is NOT a server status — it is a client-side
 * derived concept: (statutoryDeadline ?? dueDate) < today on a notice that is
 * not yet RESPONDED/CLOSED.
 *
 * Wave 7 reconciliation: legacy mobile spellings (Open/Responded/Closed/
 * Overdue, Phase 6B/6D) are dealt with server-side — the GST ListNotices
 * endpoint shims legacy *request* filters to the canonical vocabulary, and
 * responses have always been canonical. The client-side legacy tolerance is
 * dead and has been removed.
 */

export const NOTICE_STATUSES = [
  'RECEIVED',
  'UNDER_REVIEW',
  'RESPONDED',
  'CLOSED',
] as const;

export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

/** Settled = no response pending. */
const SETTLED_STATUSES: readonly string[] = ['RESPONDED', 'CLOSED'];

export function isNoticeSettled(status: string): boolean {
  return SETTLED_STATUSES.includes(status);
}

/** Local YYYY-MM-DD — notice deadlines are date-only values. */
function todayLocalIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Client-side overdue: effective deadline strictly before today AND the
 * notice is not settled.
 */
export function isNoticeOverdue(
  status: string,
  deadline?: string | null,
): boolean {
  if (isNoticeSettled(status)) return false;
  return !!deadline && deadline.slice(0, 10) < todayLocalIso();
}
