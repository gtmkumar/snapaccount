/**
 * BankCommStatusBadge — Phase 6C
 * Status badge for outbound/inbound bank messages.
 * Variants: queued (neutral), sent (info), delivered (info),
 *           responded (success), bounced (error), failed (error).
 * Always paired with icon + text — never color-only.
 */
import { Clock, Send, CheckCheck, MessageCircle, AlertCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BankCommStatus } from '@/lib/loanApi'

interface BankCommStatusBadgeProps {
  status: BankCommStatus
  size?: 'sm' | 'md'
  className?: string
}

const variantConfig: Record<
  BankCommStatus,
  { label: string; icon: React.FC<{ className?: string }>; classes: string }
> = {
  QUEUED: {
    label: 'Queued',
    icon: Clock,
    classes: 'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]',
  },
  SENT: {
    label: 'Sent',
    icon: Send,
    classes: 'bg-[var(--semantic-info-bg)] text-[var(--semantic-info-fg)]',
  },
  DELIVERED: {
    label: 'Delivered',
    icon: CheckCheck,
    classes: 'bg-[var(--semantic-info-bg)] text-[var(--semantic-info-fg)]',
  },
  RESPONDED: {
    label: 'Responded',
    icon: MessageCircle,
    classes: 'bg-[var(--semantic-success-bg)] text-[var(--semantic-success-fg)]',
  },
  BOUNCED: {
    label: 'Bounced',
    icon: AlertCircle,
    classes: 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    classes: 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]',
  },
}

export function BankCommStatusBadge({
  status,
  size = 'sm',
  className,
}: BankCommStatusBadgeProps) {
  const config = variantConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full tracking-wide',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
        config.classes,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {config.label}
    </span>
  )
}
