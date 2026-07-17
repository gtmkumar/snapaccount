/**
 * NotificationCenter — Admin header dropdown (Phase 6E)
 * Shows up to 8 recent notifications grouped by day.
 * Reads: GET /notifications/inbox
 * Writes: POST /notifications/{id}/read, POST /notifications/read-all
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, FileCheck2, BookOpenCheck, ScanLine, Coins, PhoneCall, CreditCard, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getNotificationInbox,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationInbox,
  type NotificationItem,
  type NotificationCategory,
} from '@/lib/notificationApi'
import { toast } from 'sonner'
import { isAfter, startOfDay, subDays } from 'date-fns'

// ---------------------------------------------------------------------------
// Category icon + color mapping
// ---------------------------------------------------------------------------
const CATEGORY_CONFIG: Record<NotificationCategory, {
  icon: React.FC<{ className?: string }>
  bgColor: string
  fgColor: string
  label: string
  filterKey: string
}> = {
  GST: {
    icon: FileCheck2,
    bgColor: 'bg-violet-100',
    fgColor: 'text-violet-700',
    label: t('notifications.filter.gst'),
    filterKey: 'GST',
  },
  ITR: {
    icon: BookOpenCheck,
    bgColor: 'bg-cyan-100',
    fgColor: 'text-cyan-700',
    label: t('notifications.filter.itr'),
    filterKey: 'ITR',
  },
  DOCS: {
    icon: ScanLine,
    bgColor: 'bg-indigo-100',
    fgColor: 'text-indigo-700',
    label: t('notifications.filter.docs'),
    filterKey: 'DOCS',
  },
  LOAN: {
    icon: Coins,
    bgColor: 'bg-orange-100',
    fgColor: 'text-orange-700',
    label: t('notifications.filter.loan'),
    filterKey: 'LOAN',
  },
  CALLBACK: {
    icon: PhoneCall,
    bgColor: 'bg-accent-100',
    fgColor: 'text-accent-700',
    label: t('notifications.filter.callback'),
    filterKey: 'CALLBACK',
  },
  BILLING: {
    icon: CreditCard,
    bgColor: 'bg-neutral-100',
    fgColor: 'text-neutral-700',
    label: t('notifications.filter.billing'),
    filterKey: 'BILLING',
  },
  SYSTEM: {
    icon: Info,
    bgColor: 'bg-info-100',
    fgColor: 'text-info-700',
    label: t('notifications.filter.system'),
    filterKey: 'SYSTEM',
  },
}

// ---------------------------------------------------------------------------
// Group notifications by day
// ---------------------------------------------------------------------------
function getDayGroup(date: Date): string {
  const now = new Date()
  if (isAfter(date, startOfDay(now))) return t('notifications.group.today')
  if (isAfter(date, startOfDay(subDays(now, 1)))) return t('notifications.group.yesterday')
  return t('notifications.group.thisWeek')
}

function groupNotifications(items: NotificationItem[]): { group: string; items: NotificationItem[] }[] {
  const groups: { group: string; items: NotificationItem[] }[] = []
  const groupMap = new Map<string, NotificationItem[]>()
  const orderMap = new Map<string, number>()
  let order = 0

  for (const item of items) {
    const group = getDayGroup(new Date(item.sentAt))
    if (!groupMap.has(group)) {
      groupMap.set(group, [])
      orderMap.set(group, order++)
    }
    groupMap.get(group)!.push(item)
  }

  const sorted = [...groupMap.entries()].sort((a, b) => (orderMap.get(a[0]) ?? 0) - (orderMap.get(b[0]) ?? 0))
  for (const [group, items] of sorted) {
    groups.push({ group, items })
  }
  return groups
}

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------
function NotificationRow({
  item,
  onRead,
}: {
  item: NotificationItem
  onRead: (id: string) => void
}) {
  const navigate = useNavigate()
  const cat = item.category
  const config = cat ? CATEGORY_CONFIG[cat] : undefined
  const Icon = config?.icon ?? Info
  const isUnread = item.status === 'UNREAD'

  function handleClick() {
    if (isUnread) onRead(item.id)
    if (item.deepLinkUrl) {
      void navigate(item.deepLinkUrl)
    }
  }

  return (
    <button
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors relative',
        isUnread && 'bg-brand-50/30'
      )}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {isUnread && (
        <span
          className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-brand-500"
          aria-hidden="true"
        />
      )}

      {/* Icon tile */}
      <div className={cn(
        'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
        config?.bgColor ?? 'bg-neutral-100'
      )}>
        <Icon className={cn('h-5 w-5', config?.fgColor ?? 'text-neutral-500')} aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-tight truncate', isUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700')}>
          {item.title}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{item.body}</p>
        {item.linkedEntityLabel && (
          <p className="text-xs text-brand-600 mt-0.5">{item.linkedEntityLabel}</p>
        )}
      </div>

      {/* Time */}
      <div className="shrink-0 text-right">
        <p className="text-xs text-neutral-400">{formatRelativeTime(item.sentAt)}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main dropdown
// ---------------------------------------------------------------------------
const FILTER_TABS: Array<{ key: '' | NotificationCategory; label: string }> = [
  { key: '', label: t('notifications.filter.all') },
  { key: 'GST', label: 'GST' },
  { key: 'ITR', label: 'ITR' },
  { key: 'CALLBACK', label: 'Callback' },
]

export function NotificationCenter() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'' | NotificationCategory>('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (buttonRef.current?.contains(e.target as Node)) return
      if (dropdownRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const { data, isLoading } = useQuery({
    queryKey: ['notification-inbox', activeFilter],
    queryFn: () => getNotificationInbox({
      pageSize: 20,
      category: activeFilter || undefined,
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: open,
  })

  // Always fetch unread count even when dropdown is closed
  const { data: badgeData } = useQuery({
    queryKey: ['notification-badge'],
    queryFn: () => getNotificationInbox({ pageSize: 1 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Snapshot both caches so a failed write can restore exactly what was shown
  async function snapshotInboxCaches() {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: ['notification-inbox'] }),
      queryClient.cancelQueries({ queryKey: ['notification-badge'] }),
    ])
    return {
      previousInbox: queryClient.getQueriesData<NotificationInbox>({ queryKey: ['notification-inbox'] }),
      previousBadge: queryClient.getQueryData<NotificationInbox>(['notification-badge']),
    }
  }

  function restoreInboxCaches(context?: {
    previousInbox: Array<[readonly unknown[], NotificationInbox | undefined]>
    previousBadge: NotificationInbox | undefined
  }) {
    context?.previousInbox.forEach(([key, data]) => queryClient.setQueryData(key, data))
    if (context?.previousBadge) queryClient.setQueryData(['notification-badge'], context.previousBadge)
  }

  function invalidateInboxCaches() {
    void queryClient.invalidateQueries({ queryKey: ['notification-inbox'] })
    void queryClient.invalidateQueries({ queryKey: ['notification-badge'] })
  }

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      const context = await snapshotInboxCaches()
      queryClient.setQueriesData<NotificationInbox>({ queryKey: ['notification-inbox'] }, (old) => {
        if (!old) return old
        const wasUnread = old.items.some(i => i.id === id && i.status === 'UNREAD')
        return {
          ...old,
          items: old.items.map(i => (i.id === id ? { ...i, status: 'READ' as const } : i)),
          unreadCount: wasUnread ? Math.max(0, old.unreadCount - 1) : old.unreadCount,
        }
      })
      queryClient.setQueryData<NotificationInbox>(['notification-badge'], (old) =>
        old ? { ...old, unreadCount: Math.max(0, old.unreadCount - 1) } : old,
      )
      return context
    },
    onError: (_err, _id, context) => {
      restoreInboxCaches(context)
      toast.error(t('notifications.markRead.error'))
    },
    onSettled: invalidateInboxCaches,
  })

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      const context = await snapshotInboxCaches()
      queryClient.setQueriesData<NotificationInbox>({ queryKey: ['notification-inbox'] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map(i => ({ ...i, status: 'READ' as const })),
              unreadCount: 0,
            }
          : old,
      )
      queryClient.setQueryData<NotificationInbox>(['notification-badge'], (old) =>
        old ? { ...old, unreadCount: 0 } : old,
      )
      return context
    },
    onError: (_err, _vars, context) => {
      restoreInboxCaches(context)
      toast.error(t('notifications.markAllRead.error'))
    },
    onSettled: invalidateInboxCaches,
  })

  const unreadCount = badgeData?.unreadCount ?? 0
  const items = data?.items ?? []
  const groups = groupNotifications(
    activeFilter ? items.filter(i => i.category === activeFilter) : items
  )

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(v => !v)}
        aria-label={t('notifications.title')}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          'relative flex items-center justify-center h-9 w-9 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 outline-none'
        )}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500"
            aria-label={`${unreadCount} unread notifications`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-[360px] bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 overflow-hidden"
          style={{ maxHeight: '80vh', overflowY: 'auto' }}
          role="dialog"
          aria-label={t('notifications.title')}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between z-10">
            <p className="text-sm font-semibold text-neutral-900">{t('notifications.title')}</p>
            {unreadCount > 0 && (
              <button
                onClick={() => void readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Category filter chips */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-b border-neutral-100">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={cn(
                  'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  activeFilter === tab.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                )}
                aria-pressed={activeFilter === tab.key}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {isLoading && (
            <div className="space-y-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3 animate-pulse">
                  <div className="h-10 w-10 bg-neutral-100 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-neutral-100 rounded w-3/4" />
                    <div className="h-2 bg-neutral-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="py-12 text-center px-4">
              <Bell className="h-8 w-8 text-neutral-200 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-900">{t('notifications.empty.title')}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {activeFilter ? t('notifications.emptyFiltered.body') : t('notifications.empty.body')}
              </p>
            </div>
          )}

          {!isLoading && groups.map(group => (
            <div key={group.group}>
              <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-100">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  {group.group}
                </p>
              </div>
              {group.items.slice(0, 8).map(item => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onRead={(id) => void readMutation.mutate(id)}
                />
              ))}
            </div>
          ))}

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-4 py-3">
            <button
              onClick={() => { setOpen(false); void navigate('/notifications') }}
              className="w-full text-center text-xs text-brand-600 font-medium hover:underline"
            >
              {t('notifications.viewAll')} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
