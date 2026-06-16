import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { t } from '@/i18n'
import { Search, Filter, Download, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { listDocuments, type DocumentListItem } from '@/lib/documentApi'

const PAGE_SIZE = 20

function SlaChip({ uploadedAt }: { uploadedAt: string }) {
  const now = new Date()
  const uploaded = new Date(uploadedAt)
  // SLA = 24 hours from upload
  const slaExpiry = new Date(uploaded.getTime() + 24 * 60 * 60 * 1000)
  const diffMs = slaExpiry.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffMins = Math.floor(diffMs / (1000 * 60))

  if (diffMs < 0) {
    return <Badge variant="error" dot>{t('docQueue.sla.overdue')}</Badge>
  }
  if (diffHours < 2) {
    return <Badge variant="warning" dot>{t('docQueue.sla.minsLeft', { mins: diffMins })}</Badge>
  }
  return <Badge variant="success" dot>{t('docQueue.sla.hoursLeft', { hours: Math.floor(diffHours) })}</Badge>
}

function OcrDot({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
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
): ColumnDef<DocumentListItem>[] {
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
      accessorKey: 'documentDate',
      header: t('docQueue.col.uploaded'),
      cell: ({ row }) => (
        <span className="text-sm text-neutral-500">{formatRelativeTime(row.original.uploadedAt)}</span>
      ),
    },
    {
      accessorKey: 'amount',
      header: t('docQueue.col.ocrConfidence'),
      cell: () => <OcrDot confidence={null} />,
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
      cell: ({ row }) => <SlaChip uploadedAt={row.original.uploadedAt} />,
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
  const [ocrFilter, setOcrFilter] = useState('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['document-queue', { status: statusFilter || undefined, page }],
    queryFn: () =>
      listDocuments({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
      }),
    placeholderData: (prev) => prev,
  })

  // Client-side OCR confidence filter (backend doesn't return confidence on list endpoint)
  const filteredData = useMemo(() => {
    if (!data?.items) return []
    return data.items
    // Note: OCR confidence is only available on the detail endpoint (GET /documents/{id}).
    // The list endpoint (GetDocumentsQuery) returns DocumentListDto which has no confidence field.
    // The ocrFilter UI is kept for UX consistency but cannot filter server-side without a new endpoint.
    // It is intentionally a no-op here until a confidence field is added to the list DTO.
  }, [data])

  // Approximate overdue count based on upload time + 24h SLA
  const overdueCount = filteredData.filter((d) => {
    const slaExpiry = new Date(new Date(d.uploadedAt).getTime() + 24 * 60 * 60 * 1000)
    return slaExpiry < new Date()
  }).length

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

      {/* SLA breach alert */}
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

        <NativeSelect
          label={t('docQueue.filter.ocr')}
          value={ocrFilter}
          onChange={(e) => setOcrFilter(e.target.value)}
          aria-label={t('docQueue.filter.ocr')}
          className="min-w-[10rem]"
        >
          <option value="all">{t('docQueue.filter.allOcr')}</option>
          <option value="high">{t('docQueue.filter.ocrHigh')}</option>
          <option value="medium">{t('docQueue.filter.ocrMedium')}</option>
          <option value="low">{t('docQueue.filter.ocrLow')}</option>
        </NativeSelect>

        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Filter className="h-4 w-4" />}
          onClick={() => {
            setGlobalFilter('')
            setStatusFilter('')
            setOcrFilter('all')
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
