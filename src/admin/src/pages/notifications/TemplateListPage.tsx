/**
 * TemplateListPage — Notification Template Manager list (GAP-037, Wave 7)
 * Route: /notifications/templates
 * Perms: notification.templates.read / .edit
 *
 * Backend: GET /notifications/templates?eventCode=&channel=&locale=&page=&pageSize=
 * Navigation to editor: /notifications/templates/:id (UUID)
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Search, Filter, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Toggle } from '@/components/ui/Toggle'
import { TemplateSourceChip } from '@/components/ui/TemplateSourceChip'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Can } from '@/components/shared/Can'
import { cn } from '@/lib/utils'
import {
  listNotificationTemplates,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  CHANNEL_LABELS,
  type TemplateChannel,
  type NotificationTemplate,
} from '@/lib/notificationTemplateApi'
import { format } from 'date-fns'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNELS: TemplateChannel[] = ['Push', 'Sms', 'Email', 'InApp']
const DOMAIN_GROUPS = ['GST', 'ITR', 'LOAN', 'DOCUMENT', 'SUBSCRIPTION', 'CALLBACK', 'ACCOUNT']
const LANGUAGES = ['en', 'hi', 'bn']

// ---------------------------------------------------------------------------
// Filters bar
// ---------------------------------------------------------------------------

interface FiltersState {
  eventCode: string
  channel: TemplateChannel | ''
  locale: string
  category: string
}

function FiltersBar({
  filters,
  onChange,
  onClear,
}: {
  filters: FiltersState
  onChange: (k: keyof FiltersState, v: string) => void
  onClear: () => void
}) {
  const hasActiveFilter = filters.channel || filters.locale || filters.category || filters.eventCode

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 sticky top-16 z-10 bg-white border-b border-neutral-100 -mx-4 px-4">
      {/* Search by eventCode */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={filters.eventCode}
          onChange={e => onChange('eventCode', e.target.value)}
          placeholder={t('ntpl.list.filter.event')}
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-neutral-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none"
        />
      </div>

      {/* Channel filter */}
      <select
        value={filters.channel}
        onChange={e => onChange('channel', e.target.value)}
        className="text-sm rounded-lg border border-neutral-300 px-2.5 py-1.5 focus:outline-none focus:border-brand-500"
        aria-label={t('ntpl.list.filter.channel')}
      >
        <option value="">{t('ntpl.list.filter.channel')}</option>
        {CHANNELS.map(ch => (
          <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
        ))}
      </select>

      {/* Locale pills */}
      <div className="flex gap-1" role="group" aria-label={t('ntpl.list.filter.language')}>
        {LANGUAGES.map(lang => (
          <button
            key={lang}
            onClick={() => onChange('locale', filters.locale === lang ? '' : lang)}
            className={cn(
              'px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors',
              filters.locale === lang
                ? 'bg-brand-500 text-white border-brand-500'
                : 'border-neutral-300 text-neutral-600 hover:border-brand-400'
            )}
            aria-pressed={filters.locale === lang}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <select
        value={filters.category}
        onChange={e => onChange('category', e.target.value)}
        className="text-sm rounded-lg border border-neutral-300 px-2.5 py-1.5 focus:outline-none focus:border-brand-500"
        aria-label="Category"
      >
        <option value="">All categories</option>
        {DOMAIN_GROUPS.map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {hasActiveFilter && (
        <button
          onClick={onClear}
          className="text-xs text-brand-600 hover:underline flex items-center gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          {t('common.clearFilters')}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function TemplateRow({
  template,
  onEdit,
  onToggle,
  onDelete,
  isToggling,
}: {
  template: NotificationTemplate
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  isToggling: boolean
}) {
  return (
    <tr className="hover:bg-neutral-50 border-b border-neutral-100 last:border-0">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-neutral-800">{template.eventName}</p>
          <p className="text-xs text-neutral-400 font-mono">{template.eventCode}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-neutral-700">{CHANNEL_LABELS[template.channel]}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-neutral-600 font-mono uppercase">{template.locale}</span>
      </td>
      <td className="px-4 py-3">
        <TemplateSourceChip source={template.source} />
      </td>
      <td className="px-4 py-3">
        <Can permission="notification.templates.edit" fallback={
          <span className="text-xs text-neutral-400">{template.isActive ? t('common.active') : t('common.inactive')}</span>
        }>
          <Toggle
            checked={template.isActive}
            onChange={onToggle}
            disabled={isToggling}
            label={template.isActive ? t('ntpl.editor.active') : t('common.inactive')}
          />
        </Can>
      </td>
      <td className="px-4 py-3 text-xs text-neutral-400">
        {template.updatedAt ? format(new Date(template.updatedAt), 'dd/MM/yyyy') : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5 justify-end">
          <Can permission="notification.templates.edit">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {t('common.edit')}
            </Button>
          </Can>
          {template.source === 'CUSTOM' && template.id && (
            <Can permission="notification.templates.edit">
              <button
                onClick={onDelete}
                className="p-1.5 text-xs text-neutral-400 hover:text-warning-600 rounded"
                title={t('ntpl.editor.reset')}
                aria-label={t('ntpl.editor.reset')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </Can>
          )}
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TemplateListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [filters, setFilters] = useState<FiltersState>({
    eventCode: '',
    channel: '',
    locale: '',
    category: '',
  })
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<NotificationTemplate | null>(null)

  const queryParams = {
    eventCode: filters.eventCode || undefined,
    channel: (filters.channel as TemplateChannel) || undefined,
    locale: filters.locale || undefined,
    pageSize: 100,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notification-templates', queryParams],
    queryFn: () => listNotificationTemplates(queryParams),
    staleTime: 60_000,
  })

  const toggleMutation = useMutation({
    mutationFn: (tpl: NotificationTemplate) => {
      if (!tpl.id) return Promise.reject(new Error('No template ID'))
      // Flip the active state (CG-11) — previously omitted isActive, so the toggle was a no-op.
      return updateNotificationTemplate(tpl.id, { body: tpl.body, subject: tpl.subject, isActive: !tpl.isActive })
    },
    onMutate: async (tpl) => {
      await queryClient.cancelQueries({ queryKey: ['notification-templates'] })
      const previous = queryClient.getQueriesData<{ items: NotificationTemplate[]; totalCount: number }>({
        queryKey: ['notification-templates'],
      })
      queryClient.setQueriesData<{ items: NotificationTemplate[]; totalCount: number }>(
        { queryKey: ['notification-templates'] },
        (old) =>
          old
            ? { ...old, items: old.items.map(i => (i.id === tpl.id ? { ...i, isActive: !tpl.isActive } : i)) }
            : old,
      )
      return { previous }
    },
    onSuccess: () => {
      toast.success('Template updated')
    },
    onError: (_err, _tpl, context) => {
      context?.previous.forEach(([key, cached]) => queryClient.setQueryData(key, cached))
      toast.error('Failed to update template — change reverted')
    },
    onSettled: () => {
      setTogglingId(null)
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (tpl: NotificationTemplate) => {
      if (!tpl.id) return Promise.reject(new Error('No template ID'))
      return deleteNotificationTemplate(tpl.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-templates'] })
      toast.success('Template reset to default')
      setDeleteConfirm(null)
    },
    onError: () => toast.error('Failed to reset template'),
  })

  const handleFilterChange = useCallback((k: keyof FiltersState, v: string) => {
    setFilters(f => ({ ...f, [k]: v }))
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters({ eventCode: '', channel: '', locale: '', category: '' })
  }, [])

  const templates = data?.items ?? []
  const hasFilters = !!(filters.eventCode || filters.channel || filters.locale || filters.category)
  const isFilteredEmpty = !isLoading && !isError && templates.length === 0 && hasFilters

  function handleEdit(tpl: NotificationTemplate) {
    if (tpl.id) {
      void navigate(`/notifications/templates/${tpl.id}`)
    }
  }

  function handleToggle(tpl: NotificationTemplate) {
    if (!tpl.id) return
    setTogglingId(tpl.id)
    toggleMutation.mutate(tpl)
  }

  return (
    <main aria-labelledby="ntpl-list-title" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-400 mb-1">
            {t('common.settings')} › {t('ntpl.list.title')}
          </nav>
          <h1 id="ntpl-list-title" className="text-xl font-bold text-neutral-900">
            {t('ntpl.list.title')}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {data?.totalCount != null && `${data.totalCount} templates`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-neutral-400" aria-hidden="true" />
        </div>
      </div>

      {/* Filters */}
      <FiltersBar filters={filters} onChange={handleFilterChange} onClear={handleClearFilters} />

      {/* Error */}
      {isError && (
        <AlertBanner
          type="error"
          title={t('common.error.load')}
          actions={
            <button onClick={() => void refetch()} className="text-xs font-medium text-error-700 underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {/* Loading */}
      {isLoading && <Skeleton variant="dataTableDense" />}

      {/* Filtered empty */}
      {isFilteredEmpty && (
        <div className="flex flex-col items-center py-12 gap-3">
          <p className="text-base font-semibold text-neutral-700">{t('common.noResults')}</p>
          <Button variant="secondary" size="sm" onClick={handleClearFilters}>
            {t('common.clearFilters')}
          </Button>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && templates.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-neutral-100">
          <table className="w-full text-sm" role="grid" aria-label={t('ntpl.list.title')}>
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('ntpl.list.col.event')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('ntpl.list.col.channel')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('ntpl.list.col.language')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('ntpl.list.col.source')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('ntpl.list.col.active')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('ntpl.list.col.updated')}
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map(tpl => (
                <TemplateRow
                  key={tpl.id ?? `${tpl.eventCode}:${tpl.channel}:${tpl.locale}`}
                  template={tpl}
                  onEdit={() => handleEdit(tpl)}
                  onToggle={() => handleToggle(tpl)}
                  onDelete={() => setDeleteConfirm(tpl)}
                  isToggling={togglingId === tpl.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete/reset confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-3">
            <h2 className="text-base font-semibold text-neutral-900">{t('ntpl.editor.reset')}</h2>
            <p className="text-sm text-neutral-600">
              {t('ntpl.editor.resetConfirm', { event: deleteConfirm.eventCode })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                loading={deleteMutation.isPending}
                fullWidth
              >
                {t('ntpl.editor.reset')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)} fullWidth>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
