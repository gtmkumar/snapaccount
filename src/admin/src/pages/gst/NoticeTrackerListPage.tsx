/**
 * NoticeTrackerListPage — GST notice tracker (Phase 6B)
 * Route: /gst/notices
 */
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DueDateChip } from '@/components/ui/DueDateChip'
import { NoticeFormTypeBadge, type NoticeFormType } from '@/components/ui/NoticeFormTypeBadge'
import { GstatStageChip, type GstatStage } from '@/components/ui/GstatStageChip'
import { SelectionToolbar } from '@/components/ui/SelectionToolbar'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { cn, formatDate } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listGstNotices,
  createGstNotice,
  assignGstNotice,
  markGstNoticeUnderReview,
  getNoticesDueSummary,
  type GstNotice,
  type GstNoticeStatus,
  type GstNoticeType,
  type ListNoticesParams,
} from '@/lib/gstApi'

// ---------------------------------------------------------------------------
// Status badge mapping for notices
// ---------------------------------------------------------------------------

function noticeStatusBadge(status: GstNoticeStatus) {
  const config: Record<GstNoticeStatus, { variant: 'info' | 'warning' | 'brand' | 'success'; label: string }> = {
    RECEIVED: { variant: 'info', label: t('admin.gst.notice.status.received') },
    UNDER_REVIEW: { variant: 'warning', label: t('admin.gst.notice.status.underReview') },
    RESPONDED: { variant: 'brand', label: t('admin.gst.notice.status.responded') },
    CLOSED: { variant: 'success', label: t('admin.gst.notice.status.closed') },
  }
  const cfg = config[status] ?? { variant: 'info' as const, label: status }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

const formInputClass =
  'rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/20'

// ---------------------------------------------------------------------------
// Upload Notice Modal
// ---------------------------------------------------------------------------

interface UploadNoticeModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function UploadNoticeModal({ open, onClose, onCreated }: UploadNoticeModalProps) {
  const [form, setForm] = useState({
    orgId: '',
    gstin: '',
    noticeNumber: '',
    noticeType: 'ASMT-10' as GstNoticeType,
    noticeDate: '',
    dueDate: '',
    description: '',
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})

  const mutation = useMutation({
    mutationFn: () => createGstNotice({
      orgId: form.orgId,
      gstin: form.gstin,
      noticeNumber: form.noticeNumber,
      noticeType: form.noticeType,
      noticeDate: form.noticeDate,
      dueDate: form.dueDate || undefined,
      description: form.description || undefined,
    }),
    onSuccess: () => {
      toast.success(t('admin.gst.notice.upload.success'))
      onCreated()
    },
    onError: () => toast.error(t('admin.gst.notice.upload.error')),
  })

  function validate() {
    const e: Partial<typeof form> = {}
    if (!form.gstin.trim()) e.gstin = 'GSTIN is required'
    if (!form.noticeNumber.trim()) e.noticeNumber = 'Notice number is required'
    if (!form.noticeDate) e.noticeDate = 'Notice date is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (validate()) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.gst.notice.upload.title')}
      size="md"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('admin.gst.notice.upload.cancel')}
          </Button>
          <Button type="submit" form="upload-notice-form" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? t('admin.gst.notice.upload.uploading') : t('admin.gst.notice.upload.submit')}
          </Button>
        </div>
      }
    >
      <form id="upload-notice-form" onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            {t('admin.gst.notice.field.gstin')} *
          </label>
          <input
            type="text"
            value={form.gstin}
            onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
            maxLength={15}
            placeholder="27AABCS1429B1ZB"
            className={cn('w-full px-3 py-2 text-sm outline-none', formInputClass, errors.gstin && 'border-error-500')}
          />
          {errors.gstin && <p className="text-xs text-error-600 mt-0.5">{errors.gstin}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            {t('admin.gst.notice.field.noticeNumber')} *
          </label>
          <input
            type="text"
            value={form.noticeNumber}
            onChange={e => setForm(f => ({ ...f, noticeNumber: e.target.value }))}
            placeholder="GST/24/ASMT/0931"
            className={cn('w-full px-3 py-2 text-sm outline-none', formInputClass, errors.noticeNumber && 'border-error-500')}
          />
          {errors.noticeNumber && <p className="text-xs text-error-600 mt-0.5">{errors.noticeNumber}</p>}
        </div>
        <NativeSelect
          label={`${t('admin.gst.notice.field.noticeType')} *`}
          value={form.noticeType}
          onChange={e => setForm(f => ({ ...f, noticeType: e.target.value as GstNoticeType }))}
        >
          {(['ASMT-10', 'ASMT-11', 'DRC-01', 'DRC-03', 'REG-17', 'OTHER'] as GstNoticeType[]).map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </NativeSelect>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t('admin.gst.notice.field.noticeDate')} *
            </label>
            <input
              type="date"
              value={form.noticeDate}
              onChange={e => setForm(f => ({ ...f, noticeDate: e.target.value }))}
              className={cn('w-full px-3 py-2 text-sm outline-none', formInputClass, errors.noticeDate && 'border-error-500')}
            />
            {errors.noticeDate && <p className="text-xs text-error-600 mt-0.5">{errors.noticeDate}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t('admin.gst.notice.field.dueDate')}
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              className={cn('w-full px-3 py-2 text-sm outline-none', formInputClass)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            {t('admin.gst.notice.field.description')}
          </label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className={cn('w-full px-3 py-2 text-sm outline-none resize-none', formInputClass)}
          />
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Notice row card (mobile ≤768px)
// ---------------------------------------------------------------------------

function NoticeRowCard({ notice, onClick }: { notice: GstNotice; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left min-h-[88px] p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] space-y-1.5 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        {noticeStatusBadge(notice.status)}
        {notice.dueDate && <DueDateChip dueDate={notice.dueDate} size="sm" />}
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)] font-mono">{notice.noticeNumber}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <NoticeFormTypeBadge formType={notice.noticeType as NoticeFormType} size="sm" />
        <span className="text-xs text-[var(--text-tertiary)]">· GSTIN {notice.gstin || '—'}</span>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        Received {formatDate(notice.noticeDate)}
        {notice.assignedCaName ? ` · Assigned to ${notice.assignedCaName}` : ` · ${t('admin.gst.notice.unassigned')}`}
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NoticeTrackerListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ListNoticesParams>({ page: 1, pageSize: 25 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dueFilter, setDueFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [bulkPending, setBulkPending] = useState(false)

  const queryParams: ListNoticesParams = {
    ...filters,
    search: search || undefined,
    status: statusFilter || undefined,
    dueBucket: (dueFilter as ListNoticesParams['dueBucket']) || undefined,
  }

  const isFiltered = !!(search || statusFilter || dueFilter)

  const { data: dueSummary } = useQuery({
    queryKey: ['gst-notices-due-summary'],
    queryFn: getNoticesDueSummary,
    staleTime: 60_000,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gst-notices', queryParams],
    queryFn: () => listGstNotices(queryParams),
    staleTime: 30_000,
  })

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      setBulkPending(true)
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map(id => assignGstNotice(id, 'unassigned')))
    },
    onSuccess: () => {
      setSelectedIds(new Set())
      void queryClient.invalidateQueries({ queryKey: ['gst-notices'] })
      toast.success(t('admin.gst.notice.bulk.assigned'))
    },
    onError: () => toast.error(t('admin.gst.notice.bulk.error')),
    onSettled: () => setBulkPending(false),
  })

  const bulkUnderReviewMutation = useMutation({
    mutationFn: async () => {
      setBulkPending(true)
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map(id => markGstNoticeUnderReview(id)))
    },
    onSuccess: () => {
      setSelectedIds(new Set())
      void queryClient.invalidateQueries({ queryKey: ['gst-notices'] })
      toast.success(t('admin.gst.notice.bulk.underReview'))
    },
    onError: () => toast.error(t('admin.gst.notice.bulk.error')),
    onSettled: () => setBulkPending(false),
  })

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const notices = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const isEmpty = !isLoading && !isError && notices.length === 0

  const subtitle = useMemo(() => {
    if (dueSummary) {
      const parts: string[] = []
      if (dueSummary.overdue > 0) parts.push(`${dueSummary.overdue} overdue`)
      if (dueSummary.dueThisWeek > 0) parts.push(`${dueSummary.dueThisWeek} due this week`)
      parts.push(`${totalCount} total`)
      return parts.join(' · ')
    }
    return totalCount > 0 ? `${totalCount} notices` : undefined
  }, [dueSummary, totalCount])

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setDueFilter('')
    setFilters(f => ({ ...f, page: 1 }))
  }

  function handleCreated() {
    setShowUploadModal(false)
    void queryClient.invalidateQueries({ queryKey: ['gst-notices'] })
    void queryClient.invalidateQueries({ queryKey: ['gst-notices-due-summary'] })
  }

  const statCards = dueSummary
    ? [
        { label: t('admin.gst.notice.filter.overdue'), value: dueSummary.overdue, tone: 'text-error-600' },
        { label: t('admin.gst.notice.filter.thisWeek'), value: dueSummary.dueThisWeek, tone: 'text-warning-600' },
        { label: 'Due in 2 days', value: dueSummary.dueIn2Days, tone: 'text-brand-600' },
        { label: 'Total open', value: dueSummary.total, tone: 'text-[var(--text-primary)]' },
      ]
    : []

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.gst.notice.title')}
        subtitle={subtitle}
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowUploadModal(true)}
          >
            {t('admin.gst.notice.cta.upload')}
          </Button>
        }
      />

      {/* KPI strip */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(card => (
            <Card key={card.label} padding="sm">
              <p className="text-xs text-[var(--text-tertiary)]">{card.label}</p>
              <p className={cn('text-2xl font-bold mt-1 tabular-nums', card.tone)}>{card.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-full sm:w-72">
            <Input
              placeholder={t('admin.gst.notice.filter.search')}
              value={search}
              onChange={e => { setSearch(e.target.value); setFilters(f => ({ ...f, page: 1 })) }}
              prefix={<Search className="h-4 w-4" />}
              size="sm"
              className="bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-[var(--border-default)] focus:ring-[var(--border-focus)]"
            />
          </div>
          <NativeSelect
            label={t('admin.gst.notice.filter.status')}
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setFilters(f => ({ ...f, page: 1 })) }}
            aria-label={t('admin.gst.notice.filter.status')}
            className="min-w-[160px]"
          >
            <option value="">{t('admin.gst.notice.filter.allStatuses')}</option>
            <option value="RECEIVED">{t('admin.gst.notice.status.received')}</option>
            <option value="UNDER_REVIEW">{t('admin.gst.notice.status.underReview')}</option>
            <option value="RESPONDED">{t('admin.gst.notice.status.responded')}</option>
            <option value="CLOSED">{t('admin.gst.notice.status.closed')}</option>
          </NativeSelect>
          <NativeSelect
            label={t('admin.gst.notice.filter.due')}
            value={dueFilter}
            onChange={e => { setDueFilter(e.target.value); setFilters(f => ({ ...f, page: 1 })) }}
            aria-label={t('admin.gst.notice.filter.due')}
            className="min-w-[160px]"
          >
            <option value="">{t('admin.gst.notice.filter.allDates')}</option>
            <option value="overdue">{t('admin.gst.notice.filter.overdue')}</option>
            <option value="this_week">{t('admin.gst.notice.filter.thisWeek')}</option>
            <option value="this_month">{t('admin.gst.notice.filter.thisMonth')}</option>
          </NativeSelect>
          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-[var(--text-link)] hover:underline self-end pb-1"
            >
              {t('admin.gst.notice.filter.clearAll')}
            </button>
          )}
        </div>
      </Card>

      {isError && (
        <AlertBanner
          type="error"
          title={t('admin.gst.notice.error.load')}
          actions={
            <button type="button" onClick={() => void refetch()} className="text-xs font-medium underline">
              {t('admin.gst.notice.error.retry')}
            </button>
          }
        />
      )}

      {isLoading && <Skeleton variant="dataTableDense" />}

      {isEmpty && (
        <Card>
          <EmptyState
            variant={isFiltered ? 'search.noResults' : 'notice.inbox'}
            title={isFiltered ? t('admin.gst.notice.empty.filtered') : t('admin.gst.notice.empty.title')}
            description={isFiltered ? t('admin.gst.notice.empty.filteredBody') : t('admin.gst.notice.empty.body')}
            primaryCta={!isFiltered ? { label: t('admin.gst.notice.cta.upload'), onPress: () => setShowUploadModal(true) } : undefined}
            secondaryCta={isFiltered ? { label: t('admin.gst.notice.filter.clearAll'), onPress: clearFilters } : undefined}
          />
        </Card>
      )}

      {!isLoading && !isError && notices.length > 0 && (
        <>
          <Card padding="none" className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm" role="grid" aria-label={t('admin.gst.notice.table.ariaLabel')}>
                <thead>
                  <tr className="bg-[var(--surface-sunken)] border-b border-[var(--border-subtle)]">
                    <th scope="col" className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={selectedIds.size === notices.length && notices.length > 0}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(new Set(notices.map(n => n.id)))
                          else clearSelection()
                        }}
                        className="h-4 w-4 rounded border-[var(--border-default)]"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.noticeNumber')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.type')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('gst.notice.gstat.column')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.gstin')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.received')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.due')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.status')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {t('admin.gst.notice.col.ca')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {notices.map(notice => (
                    <tr
                      key={notice.id}
                      className={cn(
                        'hover:bg-[var(--surface-sunken)] cursor-pointer transition-colors',
                        selectedIds.has(notice.id) && 'bg-brand-500/5',
                      )}
                      onClick={() => void navigate(`/gst/notices/${notice.id}`)}
                      aria-selected={selectedIds.has(notice.id)}
                    >
                      <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(notice.id) }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(notice.id)}
                          onChange={() => toggleSelect(notice.id)}
                          aria-label={`Select notice ${notice.noticeNumber}`}
                          className="h-4 w-4 rounded border-[var(--border-default)]"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[var(--text-primary)]">{notice.noticeNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <NoticeFormTypeBadge formType={notice.noticeType as NoticeFormType} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        {notice.gstatStage ? (
                          <GstatStageChip currentStage={notice.gstatStage as GstatStage} />
                        ) : (
                          <span className="text-xs text-[var(--text-disabled)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[var(--text-secondary)]">{notice.gstin || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
                        {formatDate(notice.noticeDate)}
                      </td>
                      <td className="px-4 py-3">
                        {notice.dueDate
                          ? <DueDateChip dueDate={notice.dueDate} />
                          : <span className="text-xs text-[var(--text-tertiary)]">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">{noticeStatusBadge(notice.status)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
                        {notice.assignedCaName ?? (
                          <span className="text-[var(--text-disabled)]">{t('admin.gst.notice.unassigned')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden p-3 space-y-2">
              {notices.map(notice => (
                <NoticeRowCard
                  key={notice.id}
                  notice={notice}
                  onClick={() => void navigate(`/gst/notices/${notice.id}`)}
                />
              ))}
            </div>
          </Card>

          <div className="flex items-center justify-between text-sm text-[var(--text-tertiary)]">
            <span>{t('admin.gst.notice.pagination.total', { count: totalCount })}</span>
            <div className="flex gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
              >
                {t('admin.gst.notice.pagination.prev')}
              </Button>
              <span className="px-3 py-1.5 text-[var(--text-primary)]">
                {t('admin.gst.notice.pagination.page', { page: filters.page ?? 1 })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={(filters.page ?? 1) * (filters.pageSize ?? 25) >= totalCount}
                onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                {t('admin.gst.notice.pagination.next')}
              </Button>
            </div>
          </div>
        </>
      )}

      <SelectionToolbar
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        actions={[
          {
            label: t('admin.gst.notice.bulk.assignCa'),
            onClick: () => void bulkAssignMutation.mutate(),
            pending: bulkPending,
          },
          {
            label: t('admin.gst.notice.bulk.markUnderReview'),
            onClick: () => void bulkUnderReviewMutation.mutate(),
            pending: bulkPending,
          },
        ]}
      />

      <UploadNoticeModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
