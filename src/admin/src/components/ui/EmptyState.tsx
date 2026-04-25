/**
 * EmptyState — Phase 6F Track F1
 * Contextual empty states with inline SVG illustrations.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

type EmptyVariant =
  | 'generic'
  | 'callbacks'
  | 'chat.thread'
  | 'chat.inbox'
  | 'reports'
  | 'subscriptions'
  | 'team'
  | 'search.noResults'
  | 'notice.inbox'
  | 'loans.applications'

interface EmptyStateProps {
  variant?: EmptyVariant
  title?: string
  description?: string
  primaryCta?: { label: string; onPress: () => void }
  secondaryCta?: { label: string; onPress: () => void }
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const CONTEXT_MAP: Record<EmptyVariant, { icon: ReactNode; defaultTitle: string; defaultDesc?: string }> = {
  generic: {
    icon: <GenericIcon />,
    defaultTitle: 'Nothing here yet',
    defaultDesc: 'No items to display.',
  },
  callbacks: {
    icon: <ClipboardIcon />,
    defaultTitle: 'No callbacks waiting',
    defaultDesc: 'All callback requests have been handled.',
  },
  'chat.thread': {
    icon: <ChatBubbleIcon />,
    defaultTitle: 'Start the conversation',
    defaultDesc: 'No messages yet. Send the first message.',
  },
  'chat.inbox': {
    icon: <InboxCheckIcon />,
    defaultTitle: 'Inbox zero',
    defaultDesc: 'All threads are resolved.',
  },
  reports: {
    icon: <ChartBarIcon />,
    defaultTitle: 'Generate your first report',
    defaultDesc: 'Choose a report type to get started.',
  },
  subscriptions: {
    icon: <CreditCardIcon />,
    defaultTitle: 'No active subscriptions',
    defaultDesc: 'No organisations are subscribed yet.',
  },
  team: {
    icon: <PeopleIcon />,
    defaultTitle: 'Invite your first teammate',
    defaultDesc: 'Add team members to collaborate.',
  },
  'search.noResults': {
    icon: <SearchQuestionIcon />,
    defaultTitle: 'No matches',
    defaultDesc: 'Try a different search term.',
  },
  'notice.inbox': {
    icon: <EnvelopeCheckIcon />,
    defaultTitle: 'No notices yet',
    defaultDesc: 'GST notices will appear here.',
  },
  'loans.applications': {
    icon: <HandshakeIcon />,
    defaultTitle: 'No loan applications',
    defaultDesc: 'Loan applications will appear here.',
  },
}

const SIZE_MAP = {
  sm: { wrap: 'py-6', icon: 'w-10 h-10', title: 'text-sm font-semibold', desc: 'text-xs', gap: 'gap-2' },
  md: { wrap: 'py-12', icon: 'w-14 h-14', title: 'text-base font-semibold', desc: 'text-sm', gap: 'gap-3' },
  lg: { wrap: 'py-20', icon: 'w-20 h-20', title: 'text-lg font-semibold', desc: 'text-sm', gap: 'gap-4' },
}

export function EmptyState({
  variant = 'generic',
  title,
  description,
  primaryCta,
  secondaryCta,
  size = 'md',
  className,
}: EmptyStateProps) {
  const ctx = CONTEXT_MAP[variant]
  const s = SIZE_MAP[size]

  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center', s.wrap, s.gap, className)}
      role="status"
    >
      <div
        className={cn(s.icon, 'text-[var(--text-tertiary)]')}
        aria-hidden="true"
      >
        {ctx.icon}
      </div>
      <h3
        className={cn(s.title, 'text-[var(--text-primary)]')}
        tabIndex={-1}
      >
        {title ?? ctx.defaultTitle}
      </h3>
      {(description ?? ctx.defaultDesc) && (
        <p className={cn(s.desc, 'text-[var(--text-secondary)] max-w-xs')}>
          {description ?? ctx.defaultDesc}
        </p>
      )}
      {(primaryCta || secondaryCta) && (
        <div className="flex gap-2 mt-2">
          {primaryCta && (
            <Button variant="primary" size="sm" onClick={primaryCta.onPress}>
              {primaryCta.label}
            </Button>
          )}
          {secondaryCta && (
            <Button variant="secondary" size="sm" onClick={secondaryCta.onPress}>
              {secondaryCta.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline SVG illustrations (currentColor for dark mode) ──────────────────
function GenericIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="8" y="8" width="32" height="32" rx="6" stroke="currentColor" strokeWidth="2" />
      <path d="M16 24h16M24 16v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="12" y="10" width="24" height="30" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M18 8h12v6H18z" stroke="currentColor" strokeWidth="2" />
      <path d="M18 22l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="8" y="10" width="24" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 36l4-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="20" y="22" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M36 40l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function InboxCheckIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="18" width="36" height="22" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 28h10l4 4 4-4h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 12l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChartBarIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="28" width="8" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="18" y="16" width="8" height="24" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="30" y="8" width="8" height="32" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function CreditCardIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="10" width="36" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 18h36" stroke="currentColor" strokeWidth="2" />
      <rect x="12" y="24" width="10" height="4" rx="1" fill="currentColor" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="18" cy="14" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M6 38c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="14" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M36 26c4.418 0 8 3.582 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SearchQuestionIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="2" />
      <path d="M30 30l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 16c0-1.1.9-2 2-2s2 .9 2 2c0 2-2 2-2 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="24" r="1" fill="currentColor" />
    </svg>
  )
}

function EnvelopeCheckIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="12" width="36" height="26" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 16l18 12 18-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 10l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HandshakeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M6 26l10-10h8l10 10-8 8-4-4-4 4-12-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 16l6-6 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
