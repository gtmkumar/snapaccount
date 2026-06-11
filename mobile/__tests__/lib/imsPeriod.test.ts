/**
 * imsPeriod helpers — MMYYYY conversion, GSTR-2B deadline, open-period logic.
 * Spec: docs/design/ims-inbox-spec.md §2.1, §13.
 */

import {
  currentOpenImsPeriod,
  daysUntilDate,
  formatDateDDMMMYYYY,
  formatDateDDMMYYYY,
  gstr2bDeadline,
  lastPeriods,
  parsePeriod,
  periodToLabel,
  periodToShortLabel,
  toPeriod,
} from '../../src/lib/imsPeriod';

describe('imsPeriod helpers', () => {
  it('parses MMYYYY and rejects malformed values', () => {
    expect(parsePeriod('032026')).toEqual({ month: 3, year: 2026 });
    expect(parsePeriod('132026')).toBeNull();
    expect(parsePeriod('03206')).toBeNull();
    expect(parsePeriod('March')).toBeNull();
  });

  it('converts period to display labels (spec §2.1: "032026" → "March 2026")', () => {
    expect(periodToLabel('032026')).toBe('March 2026');
    expect(periodToShortLabel('032026')).toBe('Mar 2026');
    expect(periodToLabel('garbage')).toBe('garbage');
    expect(toPeriod(3, 2026)).toBe('032026');
  });

  it('computes the GSTR-2B deadline as the 14th of the following month', () => {
    expect(gstr2bDeadline('032026')).toEqual(new Date(2026, 3, 14)); // 14 Apr 2026
    expect(gstr2bDeadline('122026')).toEqual(new Date(2027, 0, 14)); // year rollover
    expect(gstr2bDeadline('bad')).toBeNull();
  });

  it('open period is the previous month up to & incl. the 14th, then the current month', () => {
    // 11 Jun 2026 — May window (deadline 14 Jun) still open
    expect(currentOpenImsPeriod(new Date(2026, 5, 11))).toBe('052026');
    // 14 Jun 2026 — still May
    expect(currentOpenImsPeriod(new Date(2026, 5, 14))).toBe('052026');
    // 15 Jun 2026 — May swept; June period is now the open one
    expect(currentOpenImsPeriod(new Date(2026, 5, 15))).toBe('062026');
    // January edge — 10 Jan 2026 → December 2025
    expect(currentOpenImsPeriod(new Date(2026, 0, 10))).toBe('122025');
  });

  it('lists the last N periods newest-first across year boundaries', () => {
    const periods = lastPeriods(4, new Date(2026, 1, 10)); // 10 Feb 2026 → open Jan 2026
    expect(periods).toEqual(['012026', '122025', '112025', '102025']);
  });

  it('computes whole-day countdowns and Indian date formats', () => {
    const now = new Date(2026, 5, 11);
    expect(daysUntilDate('2026-06-14', now)).toBe(3);
    expect(daysUntilDate('2026-06-11', now)).toBe(0);
    expect(daysUntilDate('2026-06-10', now)).toBe(-1);
    expect(formatDateDDMMYYYY('2026-03-15')).toBe('15/03/2026');
    expect(formatDateDDMMMYYYY('2026-03-15')).toBe('15 Mar 2026');
  });
});
