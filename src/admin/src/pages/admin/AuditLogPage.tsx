/**
 * AuditLogPage — platform audit event viewer
 * Route: /admin/audit-log
 * Permission: admin.dashboard.read
 *
 * Renders a paginated table of audit events with Time, Service, Entity, Action, Actor.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { t } from '@/i18n'
import { getAuditEvents, type AuditEvent } from '@/lib/auditApi'
import { cn } from '@/lib/utils'

// Supported limit options
const LIMIT_OPTIONS = [20, 50, 100] as const
type LimitOption = (typeof LIMIT_OPTIONS)[number]

/** Format ISO timestamp to a readable local date+time string. */
function formatEventTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

export default function AuditLogPage() {
  const [limit, setLimit] = useState<LimitOption>(20)
  const [actorUserId, setActorUserId] = useState('')

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['audit', 'events', { limit, actorUserId: actorUserId || undefined }],
    queryFn: () =>
      getAuditEvents({
        limit,
        actorUserId: actorUserId.trim() || undefined,
      }),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={t('audit.title')}
          subtitle={t('audit.subtitle')}
        />
        <Button
          variant="ghost"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label={t('audit.refresh')}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          {t('audit.refresh')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Actor user ID filter */}
        <input
          type="text"
          value={actorUserId}
          onChange={e => setActorUserId(e.target.value)}
          placeholder={t('audit.filter.actorPlaceholder')}
          className="px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] w-64"
        />

        {/* Limit selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-tertiary)]">{t('audit.filter.show')}</span>
          <div className="flex gap-1">
            {LIMIT_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setLimit(opt)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-lg border transition-colors',
                  limit === opt
                    ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                    : 'bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ErrorBoundary scope="route">
        {isLoading ? (
          <Skeleton variant="dataTableDense" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-[var(--text-secondary)]">{t('audit.error.load')}</p>
            <Button variant="ghost" onClick={() => void refetch()}>
              {t('audit.error.retry')}
            </Button>
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            variant="generic"
            title={t('audit.empty.title')}
            description={t('audit.empty.body')}
          />
        ) : (
          <AuditTable events={data} />
        )}
      </ErrorBoundary>
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────────

function AuditTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table
        className="w-full text-sm"
        aria-label={t('audit.table.ariaLabel')}
      >
        <thead>
          <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">
              {t('audit.col.time')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('audit.col.service')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('audit.col.entity')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('audit.col.action')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('audit.col.actor')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {events.map(ev => (
            <AuditRow key={ev.id} event={ev} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <tr className="bg-[var(--surface-default)] hover:bg-[var(--surface-raised)] transition-colors">
      {/* Time */}
      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]">
        {formatEventTime(event.eventTime)}
      </td>

      {/* Service */}
      <td className="px-4 py-3">
        <ServiceBadge service={event.service} />
      </td>

      {/* Entity */}
      <td className="px-4 py-3 text-[var(--text-primary)]">
        {event.entityType}
      </td>

      {/* Action */}
      <td className="px-4 py-3">
        <ActionBadge action={event.action} />
      </td>

      {/* Actor */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--text-primary)] text-xs font-mono truncate max-w-[12rem]">
            {event.actorUserId ?? t('audit.actor.system')}
          </span>
          <span className="text-[var(--text-tertiary)] text-xs capitalize">
            {event.actorType.toLowerCase().replace('_', ' ')}
          </span>
        </div>
      </td>
    </tr>
  )
}

// ── Badges ─────────────────────────────────────────────────────────────────────

const SERVICE_COLOURS: Record<string, string> = {
  auth: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  gst: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  accounting: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  document: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  loan: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  itr: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  notification: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
}

function ServiceBadge({ service }: { service: string }) {
  const colour =
    SERVICE_COLOURS[service.toLowerCase()] ??
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', colour)}>
      {service}
    </span>
  )
}

const ACTION_COLOURS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  delete: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  read: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  login: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  logout: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  suspend: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

function ActionBadge({ action }: { action: string }) {
  const key = action.toLowerCase().split('_')[0]
  const colour =
    ACTION_COLOURS[key] ??
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', colour)}>
      {action}
    </span>
  )
}
