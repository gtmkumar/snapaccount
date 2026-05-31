/**
 * Shared load-level color tokens for the Team Staff (87) + Workload (89) tabs,
 * keyed by the LoadLevel from staffApi.loadLevel(). Kept in one place so the
 * roster queue badge and the workload grid cells stay visually consistent.
 */
import type { LoadLevel } from '@/lib/staffApi'

export interface LoadStyle {
  /** Tailwind classes for a pill/cell background + text. */
  className: string
  /** Tailwind class for the accompanying status dot. */
  dot: string
  /** i18n key suffix for the human label (team.workload.load.<key>). */
  labelKey: LoadLevel
}

export const LOAD_BADGE: Record<LoadLevel, LoadStyle> = {
  idle: {
    className: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
    dot: 'bg-neutral-400',
    labelKey: 'idle',
  },
  normal: {
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    labelKey: 'normal',
  },
  busy: {
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    dot: 'bg-amber-500',
    labelKey: 'busy',
  },
  heavy: {
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    dot: 'bg-orange-500',
    labelKey: 'heavy',
  },
  overloaded: {
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    dot: 'bg-rose-500',
    labelKey: 'overloaded',
  },
}
