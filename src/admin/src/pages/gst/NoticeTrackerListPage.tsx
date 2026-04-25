/**
 * NoticeTrackerListPage — GST notice tracker (Phase 6B)
 * Route: /gst/notices
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Inbox, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DueDateChip } from '@/components/ui/DueDateChip'
import { SelectionToolbar } from '@/components/ui/SelectionToolbar'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listGstNotices,
  createGstNotice,
  assignGstNotice,
  markGstNoticeUnderReview,
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

// ---------------------------------------------------------------------------
// Upload Notice Modal
// ---------------------------------------------------------------------------

interface UploadNoticeModalProps {
  onClose: () => void
  onCreated: () => void
}

function UploadNoticeModal({ onClose, onCreated }: UploadNoticeModalProps) {
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

  const inputClass = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="upload-notice-title">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 id="upload-notice-title" className="text-base font-semibold text-neutral-900">
          {t('admin.gst.notice.upload.title')}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              {t('admin.gst.notice.field.gstin')} *
            </label>
            <input
              type="text"
              value={form.gstin}
              onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
              maxLength={15}
              placeholder="27AABCS1429B1ZB"
              className={cn(inputClass, errors.gstin && 'border-error-500')}
            />
            {errors.gstin && <p className="text-xs text-error-600 mt-0.5">{errors.gstin}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              {t('admin.gst.notice.field.noticeNumber')} *
            </label>
            <input
              type="text"
              value={form.noticeNumber}
              onChange={e => setForm(f => ({ ...f, noticeNumber: e.target.value }))}
              placeholder="GST/24/ASMT/0931"
              className={cn(inputClass, errors.noticeNumber && 'border-error-500')}
            />
            {errors.noticeNumber && <p className="text-xs text-error-600 mt-0.5">{errors.noticeNumber}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              {t('admin.gst.notice.field.noticeType')} *
            </label>
            <select
              value={form.noticeType}
              onChange={e => setForm(f => ({ ...f, noticeType: e.target.value as GstNoticeType }))}
              className={inputClass}
            >
              {(['ASMT-10', 'ASMT-11', 'DRC-01', 'DRC-03', 'REG-17', 'OTHER'] as GstNoticeType[]).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                {t('admin.gst.notice.field.noticeDate')} *
              </label>
              <input
                type="date"
                value={form.noticeDate}
                onChange={e => setForm(f => ({ ...f, noticeDate: e.target.value }))}
                className={cn(inputClass, errors.noticeDate && 'border-error-500')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                {t('admin.gst.notice.field.dueDate')}
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              {t('admin.gst.notice.field.description')}
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className={inputClass}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" fullWidth disabled={mutation.isPending}>
              {mutation.isPending ? t('admin.gst.notice.upload.uploading') : t('admin.gst.notice.upload.submit')}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('admin.gst.notice.upload.cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notice row card (mobile ≤768px)
// ---------------------------------------------------------------------------

function NoticeRowCard({ notice, onClick }: { notice: GstNotice; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left min-h-[88px] p-4 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 space-y-1.5 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        {noticeStatusBadge(notice.status)}
        {notice.dueDate && <DueDateChip dueDate={notice.dueDate} size="sm" />}
      </div>
      <p className="text-sm font-semibold text-neutral-900 font-mono">{notice.noticeNumber}</p>
      <p className="text-xs text-neutral-500">
        {notice.noticeType} · GSTIN {notice.gstin}
      </p>
      <p className="text-xs text-neutral-400">
        Received {new Date(notice.createdAt).toLocaleDateString('en-IN')}
        {notice.assignedCaName ? ` · Assigned to ${notice.assignedCaName}` : ' · Unassigned'}
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

  function handleCreated() {
    setShowUploadModal(false)
    void queryClient.invalidateQueries({ queryKey: ['gst-notices'] })
    toast.success(t('admin.gst.notice.upload.success'))
  }

  return (
    <main aria-labelledby="gst-notices-title" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-400 mb-1">
            <span>GST</span>
            <span className="mx-1">›</span>
            <span className="text-neutral-600">{t('admin.gst.notice.breadcrumb')}</span>
          </nav>
          <h1 id="gst-notices-title" className="text-xl font-bold text-neutral-900">
            {t('admin.gst.notice.title')}
          </h1>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowUploadModal(true)}
        >
          {t('admin.gst.notice.cta.upload')}
        </Button>
      </div>

      {/* Filter bar (sticky) */}
      <div className="sticky top-16 z-10 bg-white border-b border-neutral-100 py-2 -mx-4 px-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.gst.notice.filter.search')}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-neutral-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm rounded-lg border border-neutral-300 px-3 py-1.5 focus:outline-none focus:border-brand-500"
          aria-label={t('admin.gst.notice.filter.status')}
        >
          <option value="">{t('admin.gst.notice.filter.allStatuses')}</option>
          <option value="RECEIVED">{t('admin.gst.notice.status.received')}</option>
          <option value="UNDER_REVIEW">{t('admin.gst.notice.status.underReview')}</option>
          <option value="RESPONDED">{t('admin.gst.notice.status.responded')}</option>
          <option value="CLOSED">{t('admin.gst.notice.status.closed')}</option>
        </select>
        <select
          value={dueFilter}
          onChange={e => setDueFilter(e.target.value)}
          className="text-sm rounded-lg border border-neutral-300 px-3 py-1.5 focus:outline-none focus:border-brand-500"
          aria-label={t('admin.gst.notice.filter.due')}
        >
          <option value="">{t('admin.gst.notice.filter.allDates')}</option>
          <option value="overdue">{t('admin.gst.notice.filter.overdue')}</option>
          <option value="this_week">{t('admin.gst.notice.filter.thisWeek')}</option>
          <option value="this_month">{t('admin.gst.notice.filter.thisMonth')}</option>
        </select>
        {(search || statusFilter || dueFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setDueFilter('') }}
            className="text-xs text-brand-600 hover:underline"
          >
            {t('admin.gst.notice.filter.clearAll')}
          </button>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <AlertBanner
          type="error"
          title={t('admin.gst.notice.error.load')}
          actions={
            <button onClick={() => void refetch()} className="text-xs font-medium text-error-700 underline">
              {t('admin.gst.notice.error.retry')}
            </button>
          }
        />
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="h-12 bg-neutral-100 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <Card>
          <div className="flex flex-col items-center py-12 gap-3">
            <Inbox className="h-10 w-10 text-neutral-300" aria-hidden="true" />
            <p className="text-base font-semibold text-neutral-700">
              {search || statusFilter || dueFilter
                ? t('admin.gst.notice.empty.filtered')
                : t('admin.gst.notice.empty.title')}
            </p>
            <p className="text-sm text-neutral-400 text-center max-w-xs">
              {search || statusFilter || dueFilter
                ? t('admin.gst.notice.empty.filteredBody')
                : t('admin.gst.notice.empty.body')}
            </p>
            {(search || statusFilter || dueFilter) && (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); setDueFilter('') }}>
                {t('admin.gst.notice.filter.clearAll')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Desktop table */}
      {!isLoading && !isError && notices.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm" role="grid" aria-label={t('admin.gst.notice.table.ariaLabel')}>
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th scope="col" className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selectedIds.size === notices.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(notices.map(n => n.id)))
                        else clearSelection()
                      }}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.noticeNumber')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.type')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.gstin')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.received')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.due')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.status')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    {t('admin.gst.notice.col.ca')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {notices.map((notice) => (
                  <tr
                    key={notice.id}
                    className={cn(
                      'hover:bg-neutral-50 cursor-pointer',
                      selectedIds.has(notice.id) && 'bg-brand-50'
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
                        className="h-4 w-4 rounded border-neutral-300"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-neutral-800">{notice.noticeNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-600">{notice.noticeType}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-neutral-700">{notice.gstin}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {new Date(notice.noticeDate).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      {notice.dueDate
                        ? <DueDateChip dueDate={notice.dueDate} />
                        : <span className="text-xs text-neutral-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {noticeStatusBadge(notice.status)}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {notice.assignedCaName ?? (
                        <span className="text-neutral-300">{t('admin.gst.notice.unassigned')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {notices.map(notice => (
              <NoticeRowCard
                key={notice.id}
                notice={notice}
                onClick={() => void navigate(`/gst/notices/${notice.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span>{t('admin.gst.notice.pagination.total', { count: totalCount })}</span>
            <div className="flex gap-1">
              <button
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilters(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                className="px-3 py-1 rounded border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40"
              >
                {t('admin.gst.notice.pagination.prev')}
              </button>
              <span className="px-3 py-1">{t('admin.gst.notice.pagination.page', { page: filters.page ?? 1 })}</span>
              <button
                disabled={(filters.page ?? 1) * (filters.pageSize ?? 25) >= totalCount}
                onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="px-3 py-1 rounded border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40"
              >
                {t('admin.gst.notice.pagination.next')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Selection toolbar */}
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

      {/* Upload modal */}
      {showUploadModal && (
        <UploadNoticeModal
          onClose={() => setShowUploadModal(false)}
          onCreated={handleCreated}
        />
      )}
    </main>
  )
}
