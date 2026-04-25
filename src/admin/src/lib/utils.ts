import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Format amount as INR using Indian number system (lakhs/crores)
 * e.g., 1234567 → ₹12,34,567
 */
export function formatINR(amount: number, options?: {
  compact?: boolean
  showPaise?: boolean
  colorCode?: boolean
}): string {
  const { compact = false, showPaise = false } = options ?? {}

  if (compact) {
    if (Math.abs(amount) >= 10_000_000) {
      return `₹${(amount / 10_000_000).toFixed(1)}Cr`
    }
    if (Math.abs(amount) >= 100_000) {
      return `₹${(amount / 100_000).toFixed(1)}L`
    }
  }

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(amount)

  return formatted
}

/**
 * Format date in Indian format DD/MM/YYYY
 */
export function formatDate(date: Date | string | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return format(d, pattern)
}

/**
 * Format datetime in IST
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return format(d, 'dd/MM/yyyy HH:mm') + ' IST'
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return formatDistanceToNow(d, { addSuffix: true })
}

/**
 * Validate Indian mobile number (10 digits, starts with 6-9)
 */
export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ''))
}

/**
 * Validate PAN number format: XXXXX9999X
 */
export function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase())
}

/**
 * Validate GSTIN format (15 characters)
 */
export function isValidGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())
}

/**
 * Mask sensitive values (show last 4 chars)
 */
export function maskSensitive(value: string, showChars = 4): string {
  if (value.length <= showChars) return '•'.repeat(value.length)
  return '•'.repeat(value.length - showChars) + value.slice(-showChars)
}

/**
 * Generate avatar initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Get deterministic color from string (for avatar backgrounds)
 */
export function getAvatarColor(name: string): string {
  const colors = [
    'bg-brand-500',
    'bg-success-600',
    'bg-warning-600',
    'bg-error-600',
    'bg-info-600',
    'bg-purple-600',
    'bg-teal-600',
    'bg-pink-600',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length] ?? 'bg-brand-500'
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '…'
}

/**
 * Parse financial year from date (April-March)
 * Returns "FY 2024-25" format
 */
export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  if (month >= 4) {
    return `FY ${year}-${String(year + 1).slice(-2)}`
  }
  return `FY ${year - 1}-${String(year).slice(-2)}`
}

/**
 * Format amount as plain Indian number without currency symbol
 * e.g., 1234567 → "12,34,567"
 */
export function formatIndianAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(amount))
}

/**
 * Get OCR confidence color class
 */
export function getOcrConfidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-success-600'
  if (confidence >= 50) return 'text-warning-600'
  return 'text-error-600'
}

/**
 * Get OCR confidence background color class
 */
export function getOcrConfidenceBg(confidence: number): string {
  if (confidence >= 80) return 'bg-success-500'
  if (confidence >= 50) return 'bg-warning-500'
  return 'bg-error-500'
}

/**
 * Format SLA time remaining
 */
export function formatSlaTime(expiresAt: Date | string): { label: string; color: string } {
  const now = new Date()
  const expires = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const diffMs = expires.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffMins = diffMs / (1000 * 60)

  if (diffMs < 0) {
    return { label: 'Overdue', color: 'text-error-600' }
  }
  if (diffHours < 2) {
    const mins = Math.floor(diffMins)
    return { label: `${mins}m left`, color: 'text-warning-600' }
  }
  const hours = Math.floor(diffHours)
  return { label: `${hours}h left`, color: 'text-success-600' }
}
