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
    classes: 'bg-neutral-50 text-neutral-600',
  },
  SENT: {
    label: 'Sent',
    icon: Send,
    classes: 'bg-info-50 text-info-700',
  },
  DELIVERED: {
    label: 'Delivered',
    icon: CheckCheck,
    classes: 'bg-info-50 text-info-700',
  },
  RESPONDED: {
    label: 'Responded',
    icon: MessageCircle,
    classes: 'bg-success-50 text-success-700',
  },
  BOUNCED: {
    label: 'Bounced',
    icon: AlertCircle,
    classes: 'bg-error-50 text-error-700',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    classes: 'bg-error-50 text-error-700',
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
