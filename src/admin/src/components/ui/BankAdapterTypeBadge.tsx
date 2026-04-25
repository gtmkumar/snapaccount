/**
 * BankAdapterTypeBadge — Phase 6C
 * Compact chip indicating the partner bank adapter type.
 * Variants: email (slate), rest (indigo), oauth (violet).
 * Always paired with icon + text per WCAG AA.
 */
import { Mail, CloudUpload, LockKeyhole } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BankAdapterType } from '@/lib/loanApi'

interface BankAdapterTypeBadgeProps {
  adapterType: BankAdapterType
  size?: 'sm' | 'md'
  className?: string
}

const variantConfig: Record<
  BankAdapterType,
  { label: string; icon: React.FC<{ className?: string }>; classes: string }
> = {
  EMAIL: {
    label: 'Email',
    icon: Mail,
    classes: 'bg-slate-100 text-slate-700',
  },
  REST: {
    label: 'REST',
    icon: CloudUpload,
    classes: 'bg-indigo-50 text-indigo-700',
  },
  OAUTH: {
    label: 'OAuth2',
    icon: LockKeyhole,
    classes: 'bg-violet-50 text-violet-700',
  },
}

export function BankAdapterTypeBadge({
  adapterType,
  size = 'sm',
  className,
}: BankAdapterTypeBadgeProps) {
  const config = variantConfig[adapterType]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full tracking-wide',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
        config.classes,
        className
      )}
      aria-label={`Adapter type: ${config.label}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {config.label}
    </span>
  )
}
