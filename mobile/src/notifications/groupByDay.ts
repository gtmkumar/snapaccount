/**
 * groupByDay — day-bucket inbox notifications for the NotificationCenter
 * SectionList. Phase 6E (DG-NOTIF-05) · spec §4.1.
 *
 * Buckets (by sentAt, local time): Today, Yesterday, This week, then a specific
 * date (DD MMM). The section title is an i18n key (or a literal date string for
 * the "earlier" bucket); the caller resolves group keys via t() and renders the
 * date literal as-is.
 */

import type { InboxNotification } from '../api/notifications';

export type DayGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export interface NotificationSection {
  /** i18n key suffix under mobile.notifications.group.*, OR a literal date. */
  key: DayGroupKey;
  /** For the "earlier" bucket: the formatted DD MMM date to display. */
  dateLabel?: string;
  data: InboxNotification[];
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Midnight (local) of the given date. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dateLabelDDMMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;
}

function bucketFor(sentAt: string, now: Date): { key: DayGroupKey; dateLabel?: string } {
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return { key: 'earlier', dateLabel: '' };

  const today0 = startOfDay(now);
  const day = startOfDay(d);
  const diffDays = Math.round((today0 - day) / 86_400_000);

  if (diffDays <= 0) return { key: 'today' };
  if (diffDays === 1) return { key: 'yesterday' };
  if (diffDays < 7) return { key: 'thisWeek' };
  return { key: 'earlier', dateLabel: dateLabelDDMMM(d) };
}

const ORDER: Record<DayGroupKey, number> = {
  today: 0,
  yesterday: 1,
  thisWeek: 2,
  earlier: 3,
};

/**
 * Group notifications into ordered day sections. Input is assumed newest-first
 * (the backend orders by created_at desc); each section preserves that order.
 * "earlier" rows are split into one section per distinct date.
 */
export function groupNotificationsByDay(
  items: InboxNotification[],
  now: Date = new Date(),
): NotificationSection[] {
  const sections: NotificationSection[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const { key, dateLabel } = bucketFor(item.sentAt, now);
    // For "earlier", split by distinct date so each day gets its own header.
    const mapKey = key === 'earlier' ? `earlier:${dateLabel ?? ''}` : key;

    const existing = indexByKey.get(mapKey);
    if (existing !== undefined) {
      sections[existing].data.push(item);
    } else {
      indexByKey.set(mapKey, sections.length);
      sections.push({ key, dateLabel, data: [item] });
    }
  }

  // Stable order: today → yesterday → thisWeek → earlier (newest date first).
  return sections.sort((a, b) => {
    if (ORDER[a.key] !== ORDER[b.key]) return ORDER[a.key] - ORDER[b.key];
    // both "earlier" — keep newest first (data already newest-first)
    const ad = a.data[0]?.sentAt ?? '';
    const bd = b.data[0]?.sentAt ?? '';
    return bd.localeCompare(ad);
  });
}
