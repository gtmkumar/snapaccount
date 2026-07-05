/**
 * ChatThreadDetailPage — Phase 6F Track F2 + DG-CHAT-07
 *
 * DG-CHAT-07: AI Draft button + canned/quick-reply chips + '/' template search.
 * All AI calls route through the backend /ai/chat endpoint (server-side RAG
 * pipeline) via src/admin/src/lib/aiApi.ts.
 * The dead client-side firebase-ai.ts has been removed.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import {
  ArrowLeft, Send, Paperclip, Check, MoreHorizontal,
  UserPlus, CheckCircle, AlertTriangle, RefreshCw, Sparkles, X, FileDown, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/DropdownMenu'
import { useChatHub } from '@/hooks/useChatHub'
import {
  getThread, getMessages, sendMessage, markThreadRead,
  resolveThread, escalateThread, reopenThread, sendTypingPing, assignThread,
  type Message,
} from '@/lib/chatApi'
import { getStaffList } from '@/lib/staffApi'
import { generateAiDraft, DEFAULT_QUICK_REPLIES, type CannedTemplate } from '@/lib/aiApi'
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

/** Max recent messages to include in the AI draft context. */
const AI_DRAFT_CONTEXT_MESSAGES = 6

export default function ChatThreadDetailPage() {
  const { threadId } = useParams<{ threadId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [messageText, setMessageText] = useState('')
  const [_isTyping, _setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())

  // AI Draft state
  const [aiDraftText, setAiDraftText] = useState<string | null>(null)
  const [aiDraftLoading, setAiDraftLoading] = useState(false)

  // "/" canned-response search overlay state
  const [showCannedOverlay, setShowCannedOverlay] = useState(false)
  const [cannedSearch, setCannedSearch] = useState('')

  // Assign-thread modal
  const [assignOpen, setAssignOpen] = useState(false)

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
      setAiDraftText(null)
      void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', threadId] })
      scrollToBottom()
    },
    onError: () => toast.error(t('chat.thread.send.error')),
  })

  const resolveMutation = useMutation({
    mutationFn: () => resolveThread(threadId!),
    onSuccess: () => {
      toast.success(t('chat.thread.resolved'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
    },
  })

  const escalateMutation = useMutation({
    mutationFn: () => escalateThread(threadId!),
    onSuccess: () => {
      toast.success(t('chat.thread.escalated'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () => reopenThread(threadId!),
    onSuccess: () => {
      toast.success(t('chat.thread.reopened'))
      void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
    },
  })

  const handleSend = () => {
    const text = messageText.trim()
    if (!text) return
    sendMutation.mutate(text)
  }

  /**
   * Export the visible transcript as a print-to-PDF document. Opens a plain,
   * print-friendly window and triggers the browser print dialog (Save as PDF).
   * No external PDF dependency — the browser renders it.
   */
  const handleExportTranscript = () => {
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) {
      toast.error(t('chat.thread.export.popupBlocked'))
      return
    }
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c))
    const title = esc(thread?.subject ?? t('chat.thread.noSubject'))
    const rows = messages
      .map(m => {
        const who = m.senderUserId === user?.uid ? t('chat.thread.export.agent') : t('chat.thread.export.user')
        const when = m.createdAt ? new Date(m.createdAt).toLocaleString('en-IN') : ''
        return `<div class="msg"><div class="meta"><b>${esc(who)}</b> · ${esc(when)}</div><div class="body">${esc(m.body)}</div></div>`
      })
      .join('')
    win.document.write(
      `<!doctype html><html><head><title>${title}</title><meta charset="utf-8"/>` +
      `<style>body{font-family:system-ui,sans-serif;margin:32px;color:#111}h1{font-size:18px}` +
      `.meta{font-size:12px;color:#666;margin-top:12px}.body{white-space:pre-wrap;font-size:14px;margin-top:2px}` +
      `.hdr{font-size:12px;color:#888;margin-bottom:16px}</style></head><body>` +
      `<h1>${title}</h1><div class="hdr">${esc(t('chat.thread.export.heading', { count: messages.length }))}</div>` +
      `${rows}</body></html>`
    )
    win.document.close()
    win.focus()
    win.print()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Close canned overlay on Enter if navigating
      if (showCannedOverlay) {
        setShowCannedOverlay(false)
        return
      }
      handleSend()
    }
    if (e.key === 'Escape' && showCannedOverlay) {
      setShowCannedOverlay(false)
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

  /**
   * Handle textarea change — detect "/" at the start to open canned overlay.
   */
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setMessageText(val)
    handleTyping()

    // Open canned overlay when the user types "/" alone or "/term"
    if (val === '/' || val.startsWith('/') && val.length > 0) {
      const term = val.startsWith('/') ? val.slice(1) : ''
      setCannedSearch(term)
      setShowCannedOverlay(true)
    } else {
      setShowCannedOverlay(false)
    }
  }

  /**
   * Apply a canned / quick-reply template to the textarea.
   */
  const applyCannedTemplate = (template: CannedTemplate) => {
    setMessageText(template.body)
    setShowCannedOverlay(false)
    setCannedSearch('')
    textareaRef.current?.focus()
  }

  /**
   * Apply the AI draft suggestion — moves it into the editable textarea.
   */
  const acceptAiDraft = () => {
    if (aiDraftText) {
      setMessageText(aiDraftText)
      setAiDraftText(null)
      textareaRef.current?.focus()
    }
  }

  /**
   * Request an AI-drafted reply from the backend /ai/chat endpoint.
   * Sends the last N message bodies as context.
   * The CA must review and explicitly send it — never auto-sends.
   */
  const handleAiDraft = async () => {
    setAiDraftLoading(true)
    setAiDraftText(null)
    try {
      const recentMessages = messages.slice(-AI_DRAFT_CONTEXT_MESSAGES)
      const context = recentMessages
        .map(m => `${m.senderUserId === user?.uid ? 'CA' : 'User'}: ${m.body}`)
        .join('\n')

      const resp = await generateAiDraft({ conversationContext: context, locale: 'en' })
      setAiDraftText(resp.answer)
    } catch {
      toast.error(t('chat.aiDraft.error'))
    } finally {
      setAiDraftLoading(false)
    }
  }

  // Filtered canned templates for the "/" overlay
  const filteredTemplates = DEFAULT_QUICK_REPLIES.filter(tpl =>
    cannedSearch === '' ||
    tpl.label.toLowerCase().includes(cannedSearch.toLowerCase()) ||
    tpl.body.toLowerCase().includes(cannedSearch.toLowerCase())
  )

  if (threadLoading) {
    return <Skeleton variant="shell" />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => navigate('/chat')}
          aria-label={t('common.back')}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">
              {thread?.subject ?? t('chat.thread.noSubject')}
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
              aria-label={t('common.actions')}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          {thread?.status !== 'resolved' && (
            <DropdownMenuItem onClick={() => resolveMutation.mutate()} icon={<CheckCircle className="h-4 w-4" />}>
              {t('chat.thread.action.resolve')}
            </DropdownMenuItem>
          )}
          {thread?.status !== 'escalated' && (
            <DropdownMenuItem onClick={() => escalateMutation.mutate()} icon={<AlertTriangle className="h-4 w-4" />}>
              {t('chat.thread.action.escalate')}
            </DropdownMenuItem>
          )}
          {(thread?.status === 'resolved' || thread?.status === 'escalated') && (
            <DropdownMenuItem onClick={() => reopenMutation.mutate()} icon={<RefreshCw className="h-4 w-4" />}>
              {t('chat.thread.action.reopen')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAssignOpen(true)} icon={<UserPlus className="h-4 w-4" />}>
            {t('chat.thread.action.assign')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportTranscript} icon={<FileDown className="h-4 w-4" />}>
            {t('chat.thread.action.export')}
          </DropdownMenuItem>
        </DropdownMenu>
      </div>

      {assignOpen && threadId && (
        <AssignThreadModal
          threadId={threadId}
          currentAssigneeId={thread?.assignedToUserId}
          onClose={() => setAssignOpen(false)}
          onDone={() => {
            setAssignOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['chat', 'thread', threadId] })
          }}
        />
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
        {messagesLoading ? (
          <Skeleton variant="list" />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[var(--text-tertiary)]">
            {t('chat.thread.empty')}
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
              {[0, 1, 2].map(i => (
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

      {/* Composer — hidden when resolved */}
      {thread?.status !== 'resolved' && (
        <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">

          {/* ── Quick-reply chips ─────────────────────────────────────────────── */}
          <div
            className="flex gap-2 flex-wrap"
            role="list"
            aria-label={t('chat.quickReply.aria')}
          >
            {DEFAULT_QUICK_REPLIES.map(tpl => (
              <button
                key={tpl.id}
                role="listitem"
                onClick={() => applyCannedTemplate(tpl)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  'border-[var(--border-default)] text-[var(--text-secondary)]',
                  'hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]',
                  'bg-[var(--surface-default)]'
                )}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          {/* ── AI Draft suggestion banner ────────────────────────────────────── */}
          {aiDraftText && (
            <div
              className={cn(
                'rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5',
                'dark:border-violet-800 dark:bg-violet-950/40'
              )}
              role="region"
              aria-label={t('chat.aiDraft.suggestion')}
            >
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                <p className="flex-1 text-sm text-violet-700 dark:text-violet-300 whitespace-pre-wrap break-words">
                  {aiDraftText}
                </p>
                <button
                  onClick={() => setAiDraftText(null)}
                  aria-label={t('chat.aiDraft.discard')}
                  className="p-0.5 rounded text-violet-400 hover:text-violet-600 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex gap-2 mt-2 ml-6">
                <button
                  onClick={acceptAiDraft}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    'bg-violet-600 text-white hover:bg-violet-700'
                  )}
                >
                  {t('chat.aiDraft.accept')}
                </button>
                <button
                  onClick={() => setAiDraftText(null)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    'border border-violet-300 text-violet-600 hover:bg-violet-100',
                    'dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900'
                  )}
                >
                  {t('chat.aiDraft.discard')}
                </button>
              </div>
            </div>
          )}

          {/* ── Canned-response "/" overlay ───────────────────────────────────── */}
          {showCannedOverlay && (
            <div
              className={cn(
                'rounded-xl border border-[var(--border-default)] bg-[var(--surface-default)]',
                'shadow-lg overflow-hidden'
              )}
              role="listbox"
              aria-label={t('chat.canned.overlayAria')}
            >
              <div className="px-3 py-1.5 border-b border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--text-tertiary)]">{t('chat.canned.hint')}</p>
              </div>
              {filteredTemplates.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--text-tertiary)]">
                  {t('chat.canned.noResults')}
                </p>
              ) : (
                filteredTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    role="option"
                    onClick={() => applyCannedTemplate(tpl)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      'hover:bg-[var(--surface-sunken)]',
                      'border-b border-[var(--border-subtle)] last:border-b-0'
                    )}
                  >
                    <span className="font-medium text-[var(--text-primary)]">{tpl.label}</span>
                    <span className="ml-2 text-[var(--text-tertiary)] truncate">{tpl.body}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Input row ─────────────────────────────────────────────────────── */}
          <div className="flex items-end gap-2">
            {/* Attachment upload has no chat-attachment backend endpoint yet;
                received attachments ARE rendered (see MessageBubble). Disabled
                rather than a silent no-op so the affordance isn't misleading. */}
            <button
              type="button"
              disabled
              aria-label={t('chat.thread.attach')}
              title={t('chat.thread.attach.unavailable')}
              className="p-2 rounded-lg text-[var(--text-tertiary)] shrink-0 opacity-40 cursor-not-allowed"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={messageText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={t('chat.thread.placeholder')}
                rows={1}
                className={cn(
                  'w-full resize-none rounded-xl px-3 py-2 text-sm',
                  'bg-[var(--surface-sunken)] border border-[var(--border-default)]',
                  'text-[var(--text-primary)] placeholder-[var(--text-tertiary)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                  'max-h-32 overflow-y-auto'
                )}
                style={{ minHeight: '40px' }}
              />
            </div>

            {/* AI Draft button */}
            <button
              onClick={() => { void handleAiDraft() }}
              disabled={aiDraftLoading || messages.length === 0}
              aria-label={t('chat.aiDraft.button')}
              title={t('chat.aiDraft.button')}
              className={cn(
                'p-2 rounded-lg transition-colors shrink-0',
                'text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              <Sparkles className={cn('h-4 w-4', aiDraftLoading && 'animate-pulse')} />
            </button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              loading={sendMutation.isPending}
              aria-label={t('chat.thread.send')}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-[var(--text-tertiary)] ml-10">
            {t('chat.thread.hint')} &middot; {t('chat.canned.slashHint')}
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

/** Parse a message's attachmentsJson defensively into a list of {name, url?}. */
function parseAttachments(attachmentsJson: string | null | undefined): { name: string; url?: string }[] {
  if (!attachmentsJson) return []
  try {
    const raw = JSON.parse(attachmentsJson) as unknown
    const arr = Array.isArray(raw) ? raw : []
    return arr
      .map((a): { name: string; url?: string } | null => {
        if (typeof a === 'string') return { name: a }
        if (a && typeof a === 'object') {
          const o = a as Record<string, unknown>
          const name = (o.fileName ?? o.name ?? o.title) as string | undefined
          const url = (o.url ?? o.uri ?? o.downloadUrl) as string | undefined
          if (name) return { name, url }
        }
        return null
      })
      .filter((x): x is { name: string; url?: string } => x !== null)
  } catch {
    return []
  }
}

function MessageBubble({ message, isMine }: MessageBubbleProps) {
  const time = message.createdAt
    ? format(new Date(message.createdAt), 'HH:mm')
    : ''
  const attachments = parseAttachments(message.attachmentsJson)

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

        {attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {attachments.map((att, i) => {
              const inner = (
                <span className="inline-flex items-center gap-1.5 truncate">
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{att.name}</span>
                </span>
              )
              return att.url ? (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center rounded-lg px-2 py-1 text-xs font-medium underline',
                    isMine ? 'bg-white/15 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-link)]'
                  )}
                >
                  {inner}
                </a>
              ) : (
                <span
                  key={i}
                  className={cn(
                    'flex items-center rounded-lg px-2 py-1 text-xs font-medium',
                    isMine ? 'bg-white/15 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)]'
                  )}
                >
                  {inner}
                </span>
              )
            })}
          </div>
        )}

        <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : 'justify-start')}>
          <span className={cn('text-xs', isMine ? 'text-white/70' : 'text-[var(--text-tertiary)]')}>
            {time}
          </span>
          {/* Honest receipt: we only know the message was sent, not delivered/read
              (no read-receipt data on the message). A single check = "sent". */}
          {isMine && <Check className="h-3 w-3 text-white/70" aria-label={t('chat.thread.receipt.sent')} />}
        </div>
      </div>
    </div>
  )
}

// ── Assign thread modal ────────────────────────────────────────────────────────

function AssignThreadModal({
  threadId,
  currentAssigneeId,
  onClose,
  onDone,
}: {
  threadId: string
  currentAssigneeId?: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [agentId, setAgentId] = useState('')

  const { data: staff, isLoading, isError } = useQuery({
    queryKey: ['staffList'],
    queryFn: () => getStaffList(),
  })

  const selectedRole = (staff ?? []).find(s => s.userId === agentId)?.role ?? 'agent'

  const mutation = useMutation({
    mutationFn: () => assignThread(threadId, { assignedToUserId: agentId, role: selectedRole }),
    onSuccess: () => {
      toast.success(t('chat.thread.assign.success'))
      onDone()
    },
    onError: () => toast.error(t('chat.thread.assign.error')),
  })

  return (
    <Modal open onClose={onClose} title={t('chat.thread.assign.title')} size="sm">
      <div className="space-y-3">
        <label htmlFor="thread-assign-agent" className="text-sm font-medium text-[var(--text-primary)] block mb-1">
          {t('chat.thread.assign.agent')}
        </label>
        {isError ? (
          <p className="text-sm text-error-600">{t('chat.thread.assign.loadError')}</p>
        ) : (
          <NativeSelect id="thread-assign-agent" value={agentId} onChange={e => setAgentId(e.target.value)} disabled={isLoading}>
            <option value="">{t('chat.thread.assign.selectAgent')}</option>
            {(staff ?? []).map(s => (
              <option key={s.userId} value={s.userId} disabled={s.userId === currentAssigneeId}>
                {s.name} · {s.roleDisplayName}{s.userId === currentAssigneeId ? ` (${t('chat.thread.assign.current')})` : ''}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" size="sm" disabled={!agentId || agentId === currentAssigneeId || mutation.isPending} onClick={() => void mutation.mutate()}>
          {mutation.isPending ? t('common.saving') : t('chat.thread.assign.confirm')}
        </Button>
      </div>
    </Modal>
  )
}
