/**
 * WorkloadTab — design Screen 89 (Workload Distribution).
 * Staff × queue-type matrix with load-colored cells and a capacity-alert banner.
 * Queues shown are those that track a per-staff assignee (GST, ITR, Chat,
 * Callbacks). Documents (no assignee) and Loans (assigned to a bank) are out of
 * scope and intentionally absent — see staffApi.ts.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info, Download } from 'lucide-react'
import {
  getStaffWorkloadGrid, loadLevel, QUEUE_KEYS, type QueueKey,
} from '@/lib/staffApi'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { cn, getInitials } from '@/lib/utils'
import { LOAD_BADGE } from './workloadColors'

const OVERLOAD_THRESHOLD = 30 // open items — matches the "heavy/overloaded" boundary

export function WorkloadTab() {
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'workload-grid'],
    queryFn: getStaffWorkloadGrid,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const rows = data?.rows ?? []
  const errors = data?.errors ?? {}
  const failedQueues = QUEUE_KEYS.filter(k => errors[k])

  const queueLabels: Record<QueueKey, string> = {
    gst: t('team.workload.queue.gst', 'GST'),
    itr: t('team.workload.queue.itr', 'ITR'),
    chat: t('team.workload.queue.chat', 'Chat'),
    callbacks: t('team.workload.queue.callbacks', 'Callbacks'),
  }

  const overloaded = rows.filter(r => r.totalAssigned > OVERLOAD_THRESHOLD)
  const available = rows.filter(r => r.totalAssigned <= 10)

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { header: t('team.workload.col.staff', 'Staff'), value: r => r.name },
      { header: t('team.staff.col.role', 'Role'), value: r => r.roleDisplayName },
      ...QUEUE_KEYS.map(k => ({ header: queueLabels[k], value: (r: typeof rows[number]) => r.queues[k] })),
      { header: t('team.workload.col.total', 'Total'), value: r => r.totalAssigned },
    ])
    downloadCsv(csvFilename('team-workload'), csv)
  }

  return (
    <div className="space-y-4">
      {/* Header bar: export */}
      {!isLoading && rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
          >
            {t('team.workload.export', 'Export CSV')}
          </Button>
        </div>
      )}

      {/* Capacity alert */}
      {!isLoading && rows.length > 0 && (overloaded.length > 0 || available.length > 0) && (
        <div className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
          overloaded.length > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)]'
        )}>
          {overloaded.length > 0
            ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            : <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />}
          <p>
            {t('team.workload.capacity', `${overloaded.length} overloaded, ${available.length} with capacity.`)}
          </p>
        </div>
      )}

      {/* Degraded-data note when a queue service failed */}
      {failedQueues.length > 0 && (
        <p className="text-xs text-[var(--text-tertiary)]">
          {t('team.workload.degraded',
            `Some queue counts are unavailable (${failedQueues.map(k => queueLabels[k]).join(', ')}) and shown as 0.`)}
        </p>
      )}

      <ErrorBoundary scope="pane">
        {isLoading ? (
          <Skeleton variant="dataTableDense" />
        ) : rows.length === 0 ? (
          <EmptyState variant="team" title={t('team.workload.empty', 'No staff to show workload for')} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full text-sm" aria-label={t('team.workload.title', 'Workload distribution')}>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                    {t('team.workload.col.staff', 'Staff')}
                  </th>
                  {QUEUE_KEYS.map(k => (
                    <th key={k} scope="col" className="px-3 py-2.5 text-center text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      {queueLabels[k]}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-center text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                    {t('team.workload.col.total', 'Total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.userId} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-sunken)]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {getInitials(r.name || r.email)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--text-primary)] truncate">{r.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] truncate">{r.roleDisplayName}</p>
                        </div>
                      </div>
                    </td>
                    {QUEUE_KEYS.map(k => {
                      const count = r.queues[k]
                      const badge = LOAD_BADGE[loadLevel(count)]
                      return (
                        <td key={k} className="px-3 py-2.5 text-center">
                          <span className={cn(
                            'inline-flex min-w-[2rem] items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums',
                            count === 0 ? 'text-[var(--text-tertiary)]' : badge.className
                          )}>
                            {count}
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-bold text-[var(--text-primary)] tabular-nums">{r.totalAssigned}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ErrorBoundary>

      {/* Legend */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-tertiary)]">
          <span>{t('team.workload.legend', 'Load')}:</span>
          {(['normal', 'busy', 'heavy', 'overloaded'] as const).map(level => (
            <span key={level} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', LOAD_BADGE[level].dot)} aria-hidden="true" />
              {t(`team.workload.load.${level}`, {
                idle: '0', normal: '1–10', busy: '11–20', heavy: '21–30', overloaded: '31+',
              }[level])}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
