import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/utils'

type AmountSize = 'sm' | 'md' | 'lg' | 'xl'
type AmountFormat = 'full' | 'compact' | 'symbol-only'
type AmountSign = 'auto' | 'positive' | 'negative' | 'none'

interface AmountDisplayProps {
  amount: number
  unit?: 'paise' | 'rupees'
  format?: AmountFormat
  sign?: AmountSign
  size?: AmountSize
  colorCode?: boolean
  className?: string
  showLabel?: boolean
}

const sizeClasses: Record<AmountSize, string> = {
  sm: 'text-sm font-medium',
  md: 'text-base font-semibold',
  lg: 'text-xl font-bold',
  xl: 'text-2xl font-extrabold',
}

export function AmountDisplay({
  amount,
  unit = 'rupees',
  format = 'full',
  sign = 'auto',
  size = 'md',
  colorCode = false,
  className,
}: AmountDisplayProps) {
  const rupeeAmount = unit === 'paise' ? amount / 100 : amount

  const isPositive = rupeeAmount >= 0

  const colorClass = colorCode
    ? isPositive
      ? 'text-positive'
      : 'text-negative'
    : ''

  const signPrefix = sign === 'positive' ? '+' :
    sign === 'negative' ? '-' :
    sign === 'auto' && rupeeAmount > 0 ? '' :
    sign === 'auto' && rupeeAmount < 0 ? '' : // formatINR handles negative
    ''

  const formattedAmount = formatINR(Math.abs(rupeeAmount), {
    compact: format === 'compact',
  })

  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        sizeClasses[size],
        colorClass,
        className
      )}
      aria-label={`${signPrefix}${formattedAmount}`}
    >
      {sign === 'positive' && rupeeAmount > 0 && '+'}
      {sign === 'negative' || (sign === 'auto' && rupeeAmount < 0) ? '-' : ''}
      {formattedAmount}
    </span>
  )
}
