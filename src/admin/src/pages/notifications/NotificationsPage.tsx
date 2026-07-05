/**
 * NotificationsPage — full-page notification center (CG-8).
 *
 * The header bell dropdown (NotificationCenter) shows only the 8 most recent items
 * and its "View all", the `g n` chord, and the command-palette action all navigate
 * here — but the route did not exist, so those links dead-ended. This page is the
 * real destination: paginated inbox with category + unread filters and mark-read.
 *
 * Reads: GET /notifications/inbox  ·  Writes: POST /notifications/{id}/read, /read-all
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileCheck2, BookOpenCheck, ScanLine, Coins, PhoneCall, CreditCard, Info, CheckCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatRelativeTime } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getNotificationInbox,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
  type NotificationCategory,
} from '@/lib/notificationApi'

const PAGE_SIZE = 20

const CATEGORY_ICON: Record<NotificationCategory, { icon: React.FC<{ className?: string }>; bg: string; fg: string }> = {
  GST: { icon: FileCheck2, bg: 'bg-violet-100', fg: 'text-violet-700' },
  ITR: { icon: BookOpenCheck, bg: 'bg-cyan-100', fg: 'text-cyan-700' },
  DOCS: { icon: ScanLine, bg: 'bg-indigo-100', fg: 'text-indigo-700' },
  LOAN: { icon: Coins, bg: 'bg-orange-100', fg: 'text-orange-700' },
  CALLBACK: { icon: PhoneCall, bg: 'bg-accent-100', fg: 'text-accent-700' },
  BILLING: { icon: CreditCard, bg: 'bg-neutral-100', fg: 'text-neutral-700' },
  SYSTEM: { icon: Info, bg: 'bg-info-100', fg: 'text-info-700' },
}

const FILTERS: Array<{ key: '' | NotificationCategory; labelKey: string }> = [
  { key: '', labelKey: 'notifications.filter.all' },
  { key: 'GST', labelKey: 'notifications.filter.gst' },
  { key: 'ITR', labelKey: 'notifications.filter.itr' },
  { key: 'DOCS', labelKey: 'notifications.filter.docs' },
  { key: 'LOAN', labelKey: 'notifications.filter.loan' },
  { key: 'CALLBACK', labelKey: 'notifications.filter.callback' },
  { key: 'BILLING', labelKey: 'notifications.filter.billing' },
  { key: 'SYSTEM', labelKey: 'notifications.filter.system' },
]

function Row({ item, onRead }: { item: NotificationItem; onRead: (id: string) => void }) {
  const navigate = useNavigate()
  const conf = item.category ? CATEGORY_ICON[item.category] : undefined
  const Icon = conf?.icon ?? Info
  const isUnread = item.status === 'UNREAD'

  return (
    <button
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors relative border-b border-neutral-100',
        isUnread && 'bg-brand-50/30',
      )}
      onClick={() => {
        if (isUnread) onRead(item.id)
        if (item.deepLinkUrl) void navigate(item.deepLinkUrl)
      }}
    >
      {isUnread && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
      )}
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', conf?.bg ?? 'bg-neutral-100')}>
        <Icon className={cn('h-5 w-5', conf?.fg ?? 'text-neutral-500')} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-tight', isUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700')}>
          {item.title}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{item.body}</p>
        {item.linkedEntityLabel && <p className="text-xs text-brand-600 mt-0.5">{item.linkedEntityLabel}</p>}
      </div>
      <p className="shrink-0 text-xs text-neutral-400">{formatRelativeTime(item.sentAt)}</p>
    </button>
  )
}

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<'' | NotificationCategory>('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', { category, unreadOnly, page }],
    queryFn: () => getNotificationInbox({
      page,
      pageSize: PAGE_SIZE,
      category: category || undefined,
      unreadOnly: unreadOnly || undefined,
    }),
    staleTime: 30_000,
  })

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications-page'] })
      void queryClient.invalidateQueries({ queryKey: ['notification-badge'] })
    },
  })

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications-page'] })
      void queryClient.invalidateQueries({ queryKey: ['notification-badge'] })
    },
  })

  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const unreadCount = data?.unreadCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function selectFilter(key: '' | NotificationCategory) {
    setCategory(key)
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('notifications.page.title')}
        subtitle={t('notifications.page.subtitle')}
        actions={
          unreadCount > 0 ? (
            <Button
              variant="secondary"
              onClick={() => void readAllMutation.mutate()}
              loading={readAllMutation.isPending}
              leftIcon={<CheckCheck className="h-4 w-4" />}
            >
              {t('notifications.markAllRead')}
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key || 'all'}
            onClick={() => selectFilter(f.key)}
            aria-pressed={category === f.key}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              category === f.key ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => { setUnreadOnly(e.target.checked); setPage(1) }}
            className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
          />
          {t('notifications.unreadOnly')}
        </label>
      </div>

      {/* List */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {isLoading ? (
          <div aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-4 py-3 animate-pulse border-b border-neutral-100">
                <div className="h-10 w-10 bg-neutral-100 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-neutral-100 rounded w-3/4" />
                  <div className="h-2 bg-neutral-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            variant="generic"
            title={t('notifications.empty.title')}
            description={category || unreadOnly ? t('notifications.emptyFiltered.body') : t('notifications.empty.body')}
          />
        ) : (
          items.map(item => (
            <Row key={item.id} item={item} onRead={(id) => void readMutation.mutate(id)} />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">
            {t('notifications.page.pageOf', { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              {t('common.prev')}
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
