/**
 * EditLogPage — MCA auditor edit-log report (GAP-100, Task #33)
 * Route: /compliance/edit-log
 * Permission: accounting.editlog.read
 *
 * Statutory requirement: Companies (Accounts) Rules, 2014 Rule 3(5)/(6)
 * Renders a paginated table of books-of-account change records with:
 *   timestamp | user (changedBy) | entity type | entity ID | operation | before→after summary
 *
 * Filters: financial year (YYYY-YY), entity type
 * CSV export button for the auditor FY export flow.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw, FileText } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Can } from '@/components/shared/Can'
import { t } from '@/i18n'
import {
  getEditLog,
  exportEditLog,
  type EditLogEntry,
  type EditLogEntityType,
} from '@/lib/accountingApi'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

/** Valid entity type filter options from the backend validator. */
const ENTITY_TYPE_OPTIONS: Array<{ value: EditLogEntityType | ''; label: string }> = [
  { value: '', label: t('editLog.filter.entityType.all') },
  { value: 'journal_entry', label: t('editLog.entityType.journal_entry') },
  { value: 'journal_entry_line', label: t('editLog.entityType.journal_entry_line') },
  { value: 'ledger_entry', label: t('editLog.entityType.ledger_entry') },
  { value: 'account', label: t('editLog.entityType.account') },
  { value: 'ledger', label: t('editLog.entityType.ledger') },
]

// Current FY as default (e.g. "2026-27")
function currentFyYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  // Indian FY: April–March. If month < 4 (Jan–Mar) we're in the previous FY
  const fyStart = now.getMonth() < 3 ? year - 1 : year
  const fyEnd = (fyStart + 1).toString().slice(-2)
  return `${fyStart}-${fyEnd}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
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

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…`
}

/** Summarises the before→after state change for display. */
function stateSummary(before: string | null, after: string | null): string {
  if (!before && !after) return '—'
  if (!before) return t('editLog.stateChange.created')
  if (!after) return t('editLog.stateChange.deleted')
  // Both present: show truncated before/after hint
  const b = before.length > 40 ? `${before.slice(0, 40)}…` : before
  const a = after.length > 40 ? `${after.slice(0, 40)}…` : after
  return `${b} → ${a}`
}

// ---------------------------------------------------------------------------
// Operation badge colours (INSERT=green, UPDATE=blue, DELETE=red)
// ---------------------------------------------------------------------------

const OPERATION_COLOURS: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  DELETE: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

function OperationBadge({ operation }: { operation: string }) {
  const colour =
    OPERATION_COLOURS[operation.toUpperCase()] ??
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide',
        colour,
      )}
    >
      {operation}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EditLogPage() {
  const [fyYear, setFyYear] = useState<string>(currentFyYear())
  const [entityType, setEntityType] = useState<EditLogEntityType | ''>('')
  const [page, setPage] = useState(1)
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['accounting', 'edit-log', { fyYear, entityType, page }],
    queryFn: () =>
      getEditLog({
        fyYear: fyYear || undefined,
        entityType: (entityType as EditLogEntityType) || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 30_000,
  })

  const totalPages = data ? Math.ceil(data.totalCount / PAGE_SIZE) : 1

  async function handleExport() {
    if (!fyYear) return
    setIsExporting(true)
    try {
      const blob = await exportEditLog(fyYear)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `edit_log_${fyYear.replace('-', '_')}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  function handleFyChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFyYear(e.target.value)
    setPage(1)
  }

  function handleEntityTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setEntityType(e.target.value as EditLogEntityType | '')
    setPage(1)
  }

  return (
    <Can
      permission="accounting.editlog.read"
      fallback={
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <FileText className="h-12 w-12 text-[var(--text-tertiary)]" aria-hidden="true" />
          <p className="text-sm text-[var(--text-secondary)]">{t('editLog.forbidden')}</p>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title={t('editLog.title')}
            subtitle={t('editLog.subtitle')}
          />
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label={t('editLog.refresh')}
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              {t('editLog.refresh')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleExport()}
              disabled={isExporting || !fyYear}
              aria-label={t('editLog.export.ariaLabel')}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? t('editLog.export.inProgress') : t('editLog.export.cta')}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          {/* FY Year filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="fy-year-input"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              {t('editLog.filter.fyYear.label')}
            </label>
            <input
              id="fy-year-input"
              type="text"
              value={fyYear}
              onChange={handleFyChange}
              placeholder={t('editLog.filter.fyYear.placeholder')}
              className="px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] w-32"
              aria-describedby="fy-year-hint"
            />
            <span id="fy-year-hint" className="text-xs text-[var(--text-tertiary)]">
              {t('editLog.filter.fyYear.hint')}
            </span>
          </div>

          {/* Entity type filter */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="entity-type-select"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              {t('editLog.filter.entityType.label')}
            </label>
            <select
              id="entity-type-select"
              value={entityType}
              onChange={handleEntityTypeChange}
              className="px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            >
              {ENTITY_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Result count */}
          {data && (
            <p className="text-sm text-[var(--text-tertiary)] pb-1">
              {t('editLog.totalCount', { count: data.totalCount })}
            </p>
          )}
        </div>

        {/* Content */}
        <ErrorBoundary scope="route">
          {isLoading ? (
            <Skeleton variant="dataTableDense" />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm text-[var(--text-secondary)]">{t('editLog.error.load')}</p>
              <Button variant="ghost" onClick={() => void refetch()}>
                {t('editLog.error.retry')}
              </Button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              variant="generic"
              title={t('editLog.empty.title')}
              description={t('editLog.empty.body')}
            />
          ) : (
            <>
              <EditLogTable entries={data.items} />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {t('editLog.pagination.page', { page, totalPages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      aria-label={t('editLog.pagination.prev')}
                    >
                      {t('editLog.pagination.prev')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      aria-label={t('editLog.pagination.next')}
                    >
                      {t('editLog.pagination.next')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </ErrorBoundary>
      </div>
    </Can>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function EditLogTable({ entries }: { entries: EditLogEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table
        className="w-full text-sm"
        aria-label={t('editLog.table.ariaLabel')}
      >
        <thead>
          <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
            <Th>{t('editLog.col.timestamp')}</Th>
            <Th>{t('editLog.col.entityType')}</Th>
            <Th>{t('editLog.col.entityId')}</Th>
            <Th>{t('editLog.col.operation')}</Th>
            <Th>{t('editLog.col.changedBy')}</Th>
            <Th>{t('editLog.col.fyYear')}</Th>
            <Th>{t('editLog.col.stateChange')}</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {entries.map(entry => (
            <EditLogRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  )
}

function EditLogRow({ entry }: { entry: EditLogEntry }) {
  return (
    <tr className="bg-[var(--surface-default)] hover:bg-[var(--surface-raised)] transition-colors">
      {/* Timestamp */}
      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]">
        {formatTimestamp(entry.changedAt)}
      </td>

      {/* Entity type */}
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {entry.entityType}
        </span>
      </td>

      {/* Entity ID */}
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]" title={entry.entityId}>
        {truncateId(entry.entityId)}
      </td>

      {/* Operation */}
      <td className="px-4 py-3">
        <OperationBadge operation={entry.operation} />
      </td>

      {/* Changed by */}
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]" title={entry.changedBy ?? undefined}>
        {entry.changedBy ? truncateId(entry.changedBy) : (
          <span className="text-[var(--text-tertiary)] italic">{t('editLog.system')}</span>
        )}
      </td>

      {/* FY Year */}
      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
        {entry.fyYear ?? '—'}
      </td>

      {/* State change summary */}
      <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-xs truncate" title={stateSummary(entry.beforeState, entry.afterState)}>
        {stateSummary(entry.beforeState, entry.afterState)}
      </td>
    </tr>
  )
}
