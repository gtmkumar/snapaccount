/**
 * AccessDeniedState — inline "you don't have permission" panel.
 *
 * Rendered in place of a data view (table/KPI/list) when its underlying request
 * returns HTTP 403. Distinct from an empty state (200, no rows): a 403 means the
 * user is authorized to the page but not to THIS resource, and must be told so
 * rather than shown a misleading "0 records" (ACM-08/09).
 *
 * This is a section-level panel, not the full-page ForbiddenPage used by route guards.
 */
import { Lock } from 'lucide-react'
import { t } from '@/i18n'

interface AccessDeniedStateProps {
  /** Optional override for the body copy (defaults to the generic message). */
  description?: string
}

export function AccessDeniedState({ description }: AccessDeniedStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center text-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-12"
    >
      <div className="p-3 rounded-full bg-[var(--surface-sunken)] mb-4">
        <Lock className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-[var(--text-primary)]">
        {t('common.accessDenied.title')}
      </p>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--text-secondary)]">
        {description ?? t('common.accessDenied.body')}
      </p>
    </div>
  )
}
