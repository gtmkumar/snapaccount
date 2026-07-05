import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gst' | 'itr' | 'loan'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  className?: string
  dot?: boolean
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]',
  brand: 'bg-[var(--badge-brand-bg)] text-[var(--badge-brand-fg)]',
  success: 'bg-[var(--semantic-success-bg)] text-[var(--semantic-success-fg)]',
  warning: 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]',
  error: 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]',
  info: 'bg-[var(--semantic-info-bg)] text-[var(--semantic-info-fg)]',
  neutral: 'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]',
  gst: 'bg-[var(--badge-gst-bg)] text-[var(--badge-gst-fg)]',
  itr: 'bg-[var(--badge-itr-bg)] text-[var(--badge-itr-fg)]',
  loan: 'bg-[var(--badge-loan-bg)] text-[var(--badge-loan-fg)]',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-neutral-500',
  brand: 'bg-brand-500',
  success: 'bg-success-600',
  warning: 'bg-warning-600',
  error: 'bg-error-600',
  info: 'bg-info-600',
  neutral: 'bg-neutral-400',
  gst: 'bg-purple-600',
  itr: 'bg-cyan-600',
  loan: 'bg-amber-600',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className,
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full tracking-wide',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

// Status badge for workflow states
type DocumentStatus = 'UPLOADED' | 'OCR_COMPLETE' | 'IN_REVIEW' | 'PROCESSED' | 'REJECTED'
type GstStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'FILED' | 'REVISION_NEEDED'
type ItrStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'USER_APPROVED' | 'FILING_IN_PROGRESS' | 'FILED' | 'E_VERIFIED' | 'COMPLETED'
type LoanStatus = 'INITIATED' | 'DOCUMENTS_READY' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ADDITIONAL_DOCS_NEEDED' | 'APPROVED' | 'DISBURSED' | 'REJECTED'

type WorkflowStatus = DocumentStatus | GstStatus | ItrStatus | LoanStatus

const statusConfig: Record<WorkflowStatus, { label: string; variant: BadgeVariant }> = {
  // Document
  UPLOADED: { label: 'Uploaded', variant: 'info' },
  OCR_COMPLETE: { label: 'OCR Complete', variant: 'brand' },
  IN_REVIEW: { label: 'In Review', variant: 'warning' },
  PROCESSED: { label: 'Processed', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'error' },
  // GST
  DRAFT: { label: 'Draft', variant: 'neutral' },
  PENDING_APPROVAL: { label: 'Pending Approval', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'info' },
  FILED: { label: 'Filed', variant: 'success' },
  REVISION_NEEDED: { label: 'Revision Needed', variant: 'error' },
  // ITR
  USER_APPROVED: { label: 'User Approved', variant: 'info' },
  FILING_IN_PROGRESS: { label: 'Filing in Progress', variant: 'brand' },
  E_VERIFIED: { label: 'E-Verified', variant: 'success' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  // Loan
  INITIATED: { label: 'Initiated', variant: 'neutral' },
  DOCUMENTS_READY: { label: 'Documents Ready', variant: 'info' },
  SUBMITTED: { label: 'Submitted', variant: 'brand' },
  UNDER_REVIEW: { label: 'Under Review', variant: 'warning' },
  ADDITIONAL_DOCS_NEEDED: { label: 'Docs Needed', variant: 'warning' },
  DISBURSED: { label: 'Disbursed', variant: 'success' },
}

interface StatusBadgeProps {
  status: WorkflowStatus
  size?: BadgeSize
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status]
  if (!config) return <Badge variant="neutral" size={size}>{status}</Badge>
  return (
    <Badge variant={config.variant} size={size} dot>
      {config.label}
    </Badge>
  )
}
