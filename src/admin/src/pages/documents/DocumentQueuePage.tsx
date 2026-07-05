import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { t } from '@/i18n'
import { Search, Filter, Download, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/layout/FilterBar'
import { DataTable } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Can } from '@/components/shared/Can'
import { formatRelativeTime, getOcrConfidenceBg } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  getAdminDocumentQueue,
  type AdminDocumentQueueItem,
  type OcrConfidenceBand,
  type AdminQueueSortBy,
} from '@/lib/documentApi'

const PAGE_SIZE = 20

/**
 * DG-DOC-04: SlaChip now reads server-computed fields from AdminDocumentQueueItem
 * instead of re-calculating 24h from uploadedAt client-side.
 *
 * - isOverdue: backend flag (past deadline AND still in a pending status)
 * - slaHoursRemaining: signed hours (negative = overdue by that many hours)
 * - slaDeadline: ISO string; null means the document category has no SLA configured
 */
function SlaChip({
  isOverdue,
  slaHoursRemaining,
  slaDeadline,
}: {
  isOverdue: boolean
  slaHoursRemaining: number | null
  slaDeadline: string | null
}) {
  if (slaDeadline === null) {
    // Category has no SLA configured — show neutral indicator
    return <span className="text-sm text-neutral-400">{t('docQueue.sla.noSla')}</span>
  }
  if (isOverdue) {
    return <Badge variant="error" dot>{t('docQueue.sla.overdue')}</Badge>
  }
  const remaining = slaHoursRemaining ?? 0
  if (remaining < 2) {
    const mins = Math.max(0, Math.floor(remaining * 60))
    return <Badge variant="warning" dot>{t('docQueue.sla.minsLeft', { mins })}</Badge>
  }
  return (
    <Badge variant="success" dot>
      {t('docQueue.sla.hoursLeft', { hours: Math.floor(remaining) })}
    </Badge>
  )
}

/**
 * DG-DOC-04: OcrDot now accepts a real confidence value from the queue DTO.
 * When the backend adds ocrConfidence to the queue projection, this renders it immediately.
 * Until then, confidence is null (the queue DTO does not yet project it).
 */
function OcrDot({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) {
    return <span className="text-sm text-neutral-400">—</span>
  }
  // Backend sends 0-1 scale; convert to percentage for display
  const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence)
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn('h-2.5 w-2.5 rounded-full', getOcrConfidenceBg(pct))}
        aria-hidden="true"
      />
      <span className="text-sm tabular-nums">{pct}%</span>
    </div>
  )
}

function buildColumns(
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<AdminDocumentQueueItem>[] {
  return [
    {
      accessorKey: 'id',
      header: t('docQueue.col.documentId'),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-brand-600 font-medium">
          {row.original.id.slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    {
      accessorKey: 'vendorName',
      header: t('docQueue.col.user'),
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-neutral-800">
            {row.original.vendorName ?? <span className="text-neutral-400">—</span>}
          </p>
          <p className="text-xs text-neutral-400">{row.original.fileName}</p>
        </div>
      ),
    },
    {
      accessorKey: 'categoryName',
      header: t('docQueue.col.category'),
      cell: ({ row }) => (
        <span className="text-sm text-neutral-600">
          {row.original.categoryName ?? <span className="text-neutral-400">—</span>}
        </span>
      ),
    },
    {
      accessorKey: 'uploadedAt',
      header: t('docQueue.col.uploaded'),
      cell: ({ row }) => (
        <span className="text-sm text-neutral-500">{formatRelativeTime(row.original.uploadedAt)}</span>
      ),
    },
    {
      accessorKey: 'ocrConfidence',
      header: t('docQueue.col.ocrConfidence'),
      cell: ({ row }) => <OcrDot confidence={row.original.ocrConfidence} />,
    },
    {
      accessorKey: 'status',
      header: t('docQueue.col.status'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cell: ({ row }) => <StatusBadge status={row.original.status as any} />,
    },
    {
      id: 'sla',
      header: t('docQueue.col.sla'),
      cell: ({ row }) => (
        <SlaChip
          isOverdue={row.original.isOverdue}
          slaHoursRemaining={row.original.slaHoursRemaining ?? null}
          slaDeadline={row.original.slaDeadline ?? null}
        />
      ),
    },
    {
      id: 'actions',
      header: t('docQueue.col.actions'),
      cell: ({ row }) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Can permission="document.read">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void navigate(`/documents/${row.original.id}`)}
            >
              {t('docQueue.action.review')}
            </Button>
          </Can>
          <Can permission="document.update">
            <Button variant="ghost" size="sm">{t('docQueue.action.assign')}</Button>
          </Can>
        </div>
      ),
    },
  ]
}

export default function DocumentQueuePage() {
  const navigate = useNavigate()
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ocrFilter, setOcrFilter] = useState<OcrConfidenceBand | 'all'>('all')
  const [sortBy, setSortBy] = useState<AdminQueueSortBy>('sla_asc')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [page, setPage] = useState(1)

  /**
   * DG-DOC-04: Switch from listDocuments (GET /documents) to getAdminDocumentQueue
   * (GET /documents/admin/queue). The queue endpoint computes SLA server-side per
   * category.SlaHours — replacing the hardcoded 24h SlaChip calculation that was
   * previously done client-side.
   *
   * OCR confidence filter: passed as ocrMinConfidence/ocrMaxConfidence query params
   * (forward-compatible — backend ignores unknown params today, will honour them once
   * the GetAdminDocumentQueueQuery projection is extended).
   */
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'admin-document-queue',
      { status: statusFilter || undefined, page, sortBy, overdueOnly, ocrBand: ocrFilter !== 'all' ? ocrFilter : undefined },
    ],
    queryFn: () =>
      getAdminDocumentQueue({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
        sortBy,
        overdueOnly: overdueOnly || undefined,
        ocrBand: ocrFilter !== 'all' ? ocrFilter : undefined,
      }),
    placeholderData: (prev) => prev,
  })

  // Client-side text search (server does not support free-text search on this endpoint)
  const filteredData = useMemo(() => {
    if (!data?.items) return []
    if (!globalFilter.trim()) return data.items
    const lower = globalFilter.toLowerCase()
    return data.items.filter(
      (item) =>
        item.fileName.toLowerCase().includes(lower) ||
        (item.vendorName?.toLowerCase().includes(lower) ?? false) ||
        item.id.toLowerCase().includes(lower),
    )
  }, [data, globalFilter])

  // Server returns isOverdue per item; count from current page for the alert banner
  const overdueCount = data?.items.filter((d) => d.isOverdue).length ?? 0

  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  const columns = useMemo(() => buildColumns(navigate), [navigate])

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('docQueue.title')}
        subtitle={`${t('docQueue.subtitle_other', { count: totalCount })}${overdueCount > 0 ? t('docQueue.subtitleSlaBreaches_other', { count: overdueCount }) : ''}`}
        actions={
          <Can permission="document.read">
            <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
              {t('docQueue.export')}
            </Button>
          </Can>
        }
      />

      {/* Load error */}
      {isError && (
        <AlertBanner
          type="error"
          title={t('docQueue.loadError')}
          actions={
            <button type="button" onClick={() => void refetch()} className="text-xs underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {/* SLA breach alert — based on server isOverdue flag */}
      {!isError && overdueCount > 0 && (
        <AlertBanner
          type="error"
          title={t('docQueue.slaAlert.title')}
          description={t('docQueue.slaAlert.desc_other', { count: overdueCount })}
        />
      )}

      {/* Filters */}
      <FilterBar>
        <div className="w-64">
          <Input
            placeholder={t('docQueue.search')}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            size="sm"
          />
        </div>

        <NativeSelect
          label={t('docQueue.filter.status')}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          aria-label={t('docQueue.filter.status')}
          className="min-w-[10rem]"
        >
          <option value="">{t('docQueue.filter.allStatuses')}</option>
          <option value="UPLOADED">{t('docQueue.filter.uploaded')}</option>
          <option value="OCR_COMPLETE">{t('docQueue.filter.ocrComplete')}</option>
          <option value="IN_REVIEW">{t('docQueue.filter.inReview')}</option>
        </NativeSelect>

        {/* DG-DOC-04: OCR confidence filter — server-side via ocrMinConfidence/ocrMaxConfidence params */}
        <NativeSelect
          label={t('docQueue.filter.ocr')}
          value={ocrFilter}
          onChange={(e) => { setOcrFilter(e.target.value as OcrConfidenceBand | 'all'); setPage(1) }}
          aria-label={t('docQueue.filter.ocr')}
          className="min-w-[10rem]"
        >
          <option value="all">{t('docQueue.filter.allOcr')}</option>
          <option value="high">{t('docQueue.filter.ocrHigh')}</option>
          <option value="medium">{t('docQueue.filter.ocrMedium')}</option>
          <option value="low">{t('docQueue.filter.ocrLow')}</option>
        </NativeSelect>

        {/* DG-DOC-04: Sort by SLA urgency (server-side) */}
        <NativeSelect
          label={t('docQueue.filter.sortBy')}
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as AdminQueueSortBy); setPage(1) }}
          aria-label={t('docQueue.filter.sortBy')}
          className="min-w-[10rem]"
        >
          <option value="sla_asc">{t('docQueue.filter.sortSlaUrgent')}</option>
          <option value="uploaded_desc">{t('docQueue.filter.sortNewest')}</option>
        </NativeSelect>

        {/* DG-DOC-04: Overdue-only toggle (server-side filter) */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1) }}
            className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
          />
          <Clock className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
          {t('docQueue.filter.overdueOnly')}
        </label>

        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Filter className="h-4 w-4" />}
          onClick={() => {
            setGlobalFilter('')
            setStatusFilter('')
            setOcrFilter('all')
            setSortBy('sla_asc')
            setOverdueOnly(false)
            setPage(1)
          }}
        >
          {t('docQueue.filter.reset')}
        </Button>
      </FilterBar>

      {/* Table */}
      <DataTable
        data={filteredData}
        columns={columns}
        loading={isLoading}
        globalFilter={globalFilter}
        onRowClick={(row) => void navigate(`/documents/${row.id}`)}
        emptyState={
          <div className="py-8 text-center text-neutral-500">
            <p className="font-medium">{t('docQueue.empty.title')}</p>
            <p className="text-sm mt-1">{t('docQueue.empty.desc')}</p>
          </div>
        }
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-neutral-500">
            {t('docQueue.page', { page, total: totalPages })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              {t('common.prev')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || !data?.hasNextPage}
              leftIcon={<ChevronRight className="h-4 w-4" />}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
