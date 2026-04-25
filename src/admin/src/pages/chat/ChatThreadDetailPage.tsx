/**
 * ChatThreadDetailPage — Phase 6F Track F2
 * Message bubbles, typing indicator, read receipts, status transitions.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Send, Paperclip, CheckCheck, MoreHorizontal,
  UserPlus, CheckCircle, AlertTriangle, RefreshCw,
} from 'lucide-react'
// PageHeader import reserved for future sub-navigation (SEC-056 pattern)
// import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/DropdownMenu'
import { useChatHub } from '@/hooks/useChatHub'
import {
  getThread, getMessages, sendMessage, markThreadRead,
  resolveThread, escalateThread, reopenThread, sendTypingPing,
  type Message,
} from '@/lib/chatApi'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  'open': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'pending-user': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'resolved': 'bg-neutral-100 text-neutral-600',
  'escalated': 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

export default function ChatThreadDetailPage() {
  const { threadId } = useParams<{ threadId: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [messageText, setMessageText] = useState('')
  const [_isTyping, _setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Thread detail
  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['chat', 'thread', threadId],
    queryFn: () => getThread(threadId!),
    enabled: !!threadId,
  })

  // Messages
  const { data: messagesData, isLoading: messagesLoading, refetch: _refetchMessages } = useQuery({
    queryKey: ['chat', 'messages', threadId],
    queryFn: () => getMessages(threadId!, { pageSize: 50 }),
    enabled: !!threadId,
    staleTime: 30_000,
  })

  const messages = messagesData?.items ?? []

  // SignalR
  const { joinThread, leaveThread, isConnected } = useChatHub({
    onMessage: (msg) => {
      if (msg.threadId === threadId) {
        void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', threadId] })
        setTypingUsers(prev => { const next = new Set(prev); next.delete(msg.senderUserId); return next })
        scrollToBottom()
      }
    },
    onTyping: (evt) => {
      if (evt.threadId === threadId && evt.userId !== user?.uid) {
        setTypingUsers(prev => new Set(prev).add(evt.userId))
        setTimeout(() => {
          setTypingUsers(prev => { const next = new Set(prev); next.delete(evt.userId); return next })
        }, 3000)
      }
    },
  })

  useEffect(() => {
    if (threadId && isConnected) {
      void joinThread(threadId)
      return () => { void leaveThread(threadId) }
    }
  }, [threadId, isConnected, joinThread, leaveThread])

  // Mark read on open
  useEffect(() => {
    if (threadId) {
      void markThreadRead(threadId)
    }
  }, [threadId])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMessage(threadId!, { body, clientMessageId: crypto.randomUUID() }),
    onSuccess: () => {
      setMessageText('')
      void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', threadId] })
      scrollToBottom()
    },
    onError: () => toast.error(t('chat.thread.send.error', 'Failed to send message')),
  })

  const resolveMutation = useMutation({
    mutationFn: () => resolveThread(threadId!),
    onSuccess: () => {
      toast.success(t('chat.thread.resolved', 'Thread resolved'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
    },
  })

  const escalateMutation = useMutation({
    mutationFn: () => escalateThread(threadId!),
    onSuccess: () => {
      toast.success(t('chat.thread.escalated', 'Thread escalated'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () => reopenThread(threadId!),
    onSuccess: () => {
      toast.success(t('chat.thread.reopened', 'Thread reopened'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
    },
  })

  const handleSend = () => {
    const text = messageText.trim()
    if (!text) return
    sendMutation.mutate(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTyping = () => {
    if (!typingDebounce.current) {
      void sendTypingPing(threadId!)
    }
    if (typingDebounce.current) clearTimeout(typingDebounce.current)
    typingDebounce.current = setTimeout(() => {
      typingDebounce.current = null
    }, 2000)
  }

  if (threadLoading) {
    return <Skeleton variant="shell" />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => navigate('/chat')}
          aria-label={t('common.back', 'Back')}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">
              {thread?.subject ?? t('chat.thread.noSubject', 'Thread')}
            </h1>
            {thread?.status && (
              <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium shrink-0', STATUS_COLORS[thread.status])}>
                {thread.status}
              </span>
            )}
            {thread?.category && (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                {thread.category}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {thread?.participants.length ?? 0} participants
          </p>
        </div>

        {/* Actions menu */}
        <DropdownMenu
          trigger={
            <button
              aria-label={t('common.actions', 'Actions')}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          {thread?.status !== 'resolved' && (
            <DropdownMenuItem onClick={() => resolveMutation.mutate()} icon={<CheckCircle className="h-4 w-4" />}>
              {t('chat.thread.action.resolve', 'Mark resolved')}
            </DropdownMenuItem>
          )}
          {thread?.status !== 'escalated' && (
            <DropdownMenuItem onClick={() => escalateMutation.mutate()} icon={<AlertTriangle className="h-4 w-4" />}>
              {t('chat.thread.action.escalate', 'Escalate')}
            </DropdownMenuItem>
          )}
          {(thread?.status === 'resolved' || thread?.status === 'escalated') && (
            <DropdownMenuItem onClick={() => reopenMutation.mutate()} icon={<RefreshCw className="h-4 w-4" />}>
              {t('chat.thread.action.reopen', 'Reopen')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<UserPlus className="h-4 w-4" />}>
            {t('chat.thread.action.assign', 'Assign to agent')}
          </DropdownMenuItem>
        </DropdownMenu>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
        {messagesLoading ? (
          <Skeleton variant="list" />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[var(--text-tertiary)]">
            {t('chat.thread.empty', 'No messages yet. Start the conversation.')}
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.messageId}
              message={msg}
              isMine={msg.senderUserId === user?.uid}
            />
          ))
        )}

        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 pl-2">
            <div className="flex gap-0.5">
              {[0,1,2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-[var(--text-tertiary)]">typing…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {thread?.status !== 'resolved' && (
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-end gap-2">
            <button
              aria-label={t('chat.thread.attach', 'Attach file')}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={e => { setMessageText(e.target.value); handleTyping() }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.thread.placeholder', 'Type a message… (Enter to send, Shift+Enter for new line)')}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-xl px-3 py-2 text-sm',
                'bg-[var(--surface-sunken)] border border-[var(--border-default)]',
                'text-[var(--text-primary)] placeholder-[var(--text-tertiary)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                'max-h-32 overflow-y-auto'
              )}
              style={{ minHeight: '40px' }}
            />

            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              loading={sendMutation.isPending}
              aria-label={t('chat.thread.send', 'Send message')}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1 ml-10">
            {t('chat.thread.hint', 'Enter to send · Shift+Enter for new line')}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message
  isMine: boolean
}

function MessageBubble({ message, isMine }: MessageBubbleProps) {
  const time = message.createdAt
    ? format(new Date(message.createdAt), 'HH:mm')
    : ''

  return (
    <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm',
          isMine
            ? 'bg-[var(--brand-primary)] text-white rounded-br-sm'
            : 'bg-[var(--surface-sunken)] text-[var(--text-primary)] rounded-bl-sm'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : 'justify-start')}>
          <span className={cn('text-xs', isMine ? 'text-white/70' : 'text-[var(--text-tertiary)]')}>
            {time}
          </span>
          {isMine && <CheckCheck className="h-3 w-3 text-white/70" />}
        </div>
      </div>
    </div>
  )
}
