/**
 * RoleChip — Phase 6F Track F1
 * Color-coded chip per role. Used in Team page.
 */
import { cn } from '@/lib/utils'
import type { AdminRole } from '@/hooks/useAuth'

const ROLE_CONFIG: Record<AdminRole, { label: string; className: string }> = {
  SUPER_ADMIN: {
    label: 'Admin',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  OPERATIONS_MANAGER: {
    label: 'Ops Manager',
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  },
  CA: {
    label: 'CA',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  SUPPORT_EXECUTIVE: {
    label: 'Support',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  DATA_ENTRY_OPERATOR: {
    label: 'Data Entry',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  },
  PARTNER_BANK_REP: {
    label: 'Bank Rep',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
}

interface RoleChipProps {
  role: AdminRole
  size?: 'sm' | 'md'
  className?: string
}

export function RoleChip({ role, size = 'sm', className }: RoleChipProps) {
  const config = ROLE_CONFIG[role] ?? { label: role, className: 'bg-neutral-100 text-neutral-700' }

  return (
    <span
      role="img"
      aria-label={`Role: ${config.label}`}
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
