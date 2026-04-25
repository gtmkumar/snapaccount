/**
 * ChatInboxPage — Phase 6F Track F2
 * Operational queue: filter, bulk actions, real-time updates via SignalR.
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare, RefreshCw, Search,
  CheckCheck,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useChatHub } from '@/hooks/useChatHub'
import {
  listThreads, markThreadRead, resolveThread,
  type ThreadSummary, type ChatCategory, type ThreadStatus,
} from '@/lib/chatApi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

// ── Filter types ─────────────────────────────────────────────────────────────

type AssignmentFilter = 'all' | 'me' | 'unassigned' | 'team'
const STATUS_OPTIONS: ThreadStatus[] = ['open', 'pending-user', 'resolved', 'escalated']
const CATEGORY_OPTIONS: ChatCategory[] = ['tax-query', 'gst-notice', 'loan', 'general', 'feature-request', 'bug']

const STATUS_COLORS: Record<ThreadStatus, string> = {
  'open': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'pending-user': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'resolved': 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  'escalated': 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

export default function ChatInboxPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [_assignment, _setAssignment] = useState<AssignmentFilter>('all')
  const [statusFilter, setStatusFilter] = useState<ThreadStatus | undefined>(undefined)
  const [categoryFilter, setCategoryFilter] = useState<ChatCategory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [typingThreads, setTypingThreads] = useState<Set<string>>(new Set())

  // Real-time chat hub
  useChatHub({
    onMessage: (msg) => {
      void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] })
      // Remove typing indicator
      setTypingThreads(prev => { const next = new Set(prev); next.delete(msg.threadId); return next })
    },
    onTyping: (evt) => {
      setTypingThreads(prev => new Set(prev).add(evt.threadId))
      // Auto-clear after 3s
      setTimeout(() => {
        setTypingThreads(prev => { const next = new Set(prev); next.delete(evt.threadId); return next })
      }, 3000)
    },
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['chat', 'threads', { status: statusFilter, categoryFilter }],
    queryFn: () => listThreads({ status: statusFilter, pageSize: 50 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const threads = data?.items ?? []

  // Apply client-side filters
  const filtered = threads.filter(t => {
    if (categoryFilter.length > 0 && !categoryFilter.includes(t.category)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!t.subject?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const _markReadMutation = useMutation({
    mutationFn: markThreadRead,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] }) },
  })

  const resolveMutation = useMutation({
    mutationFn: resolveThread,
    onSuccess: () => {
      toast.success(t('chat.inbox.bulk.markResolved', 'Threads resolved'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] })
      setSelectedIds(new Set())
    },
  })

  const handleBulkResolve = () => {
    for (const id of selectedIds) {
      resolveMutation.mutate(id)
    }
  }

  const _handleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.threadId)))
    }
  }, [filtered, selectedIds.size])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const unreadCount = threads.filter(t => t.unreadCount > 0).length

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {t('chat.inbox.title', 'Chat')}
          </h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--brand-primary)] text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="primary" size="sm">
            <Pencil className="h-4 w-4 mr-1" />
            {t('chat.inbox.compose', 'Compose')}
          </Button>
        </div>
      </div>

      <div className="flex gap-0 md:gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left column — filters + thread list */}
        <div className="flex flex-col w-full md:w-80 shrink-0 min-h-0">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('chat.inbox.search', 'Search threads…')}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>

          {/* Filter region */}
          <div role="region" aria-label={t('chat.inbox.filter.aria', 'Filters')} className="mb-3 space-y-2">
            {/* Status filters */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setStatusFilter(undefined)}
                className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  !statusFilter ? 'bg-[var(--brand-primary)] text-white' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                )}
              >
                {t('chat.inbox.filter.status.all', 'All')}
              </button>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    statusFilter === s ? 'bg-[var(--brand-primary)] text-white' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    setCategoryFilter(prev =>
                      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                    )
                  }}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    categoryFilter.includes(c) ? 'bg-amber-500 text-white' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk toolbar */}
          {selectedIds.size > 0 && (
            <div className="mb-2 p-2 rounded-lg bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--brand-primary)] font-medium">{selectedIds.size} selected</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={handleBulkResolve}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  {t('chat.inbox.bulk.markResolved', 'Resolve')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto space-y-1" role="list">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl skeleton-shimmer" />
              ))
            ) : isError ? (
              <div className="text-sm text-[var(--text-secondary)] text-center py-8">
                {t('chat.inbox.error', 'Failed to load threads.')}
                <button onClick={() => refetch()} className="block mt-2 text-[var(--text-link)] hover:underline mx-auto">
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                variant="chat.inbox"
                size="sm"
                title={searchQuery || statusFilter ? t('chat.inbox.empty.filtered', 'No threads match these filters') : undefined}
                primaryCta={searchQuery || statusFilter ? {
                  label: 'Clear filters',
                  onPress: () => { setSearchQuery(''); setStatusFilter(undefined); setCategoryFilter([]) }
                } : undefined}
              />
            ) : (
              filtered.map(thread => (
                <ThreadRow
                  key={thread.threadId}
                  thread={thread}
                  isSelected={selectedIds.has(thread.threadId)}
                  isTyping={typingThreads.has(thread.threadId)}
                  onToggleSelect={toggleSelect}
                  onOpen={() => navigate(`/chat/${thread.threadId}`)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right pane placeholder (desktop) */}
        <div className="hidden md:flex flex-1 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm text-[var(--text-secondary)]">
              {t('chat.inbox.select', 'Select a thread to view conversation')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Thread row ────────────────────────────────────────────────────────────────

interface ThreadRowProps {
  thread: ThreadSummary
  isSelected: boolean
  isTyping: boolean
  onToggleSelect: (id: string) => void
  onOpen: () => void
}

function ThreadRow({ thread, isSelected, isTyping, onToggleSelect, onOpen }: ThreadRowProps) {
  const hasUnread = thread.unreadCount > 0
  const timeAgo = thread.lastMessageAt
    ? formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })
    : ''

  return (
    <div
      role="listitem"
      className={cn(
        'group relative flex items-start gap-2 p-3 rounded-xl cursor-pointer transition-colors',
        'border-l-2',
        hasUnread ? 'border-l-[var(--brand-primary)]' : 'border-l-transparent',
        isSelected ? 'bg-[var(--surface-sunken)]' : 'hover:bg-[var(--surface-sunken)]/60'
      )}
      onClick={onOpen}
      aria-current={isSelected}
    >
      {/* Checkbox — appears on hover */}
      <div
        className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => { e.stopPropagation(); onToggleSelect(thread.threadId) }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(thread.threadId)}
          aria-label={`Select thread ${thread.subject ?? thread.threadId}`}
          className="rounded border-[var(--border-default)]"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Avatar placeholder */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center text-sm font-bold text-[var(--text-secondary)]">
        {thread.category[0].toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn('text-sm truncate', hasUnread ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]')}>
            {thread.subject ?? thread.threadId.slice(0, 8)}
          </span>
          <span className="text-xs text-[var(--text-tertiary)] shrink-0">{timeAgo}</span>
        </div>

        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', STATUS_COLORS[thread.status])}>
            {thread.status}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {thread.category}
          </span>
        </div>

        {isTyping ? (
          <p className="text-xs text-[var(--text-tertiary)] italic truncate">typing…</p>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)] truncate">
            {thread.unreadCount > 0 ? `${thread.unreadCount} unread` : 'No new messages'}
          </p>
        )}
      </div>

      {thread.unreadCount > 0 && (
        <div className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-[var(--brand-primary)] text-white text-xs font-bold">
          {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
        </div>
      )}
    </div>
  )
}
