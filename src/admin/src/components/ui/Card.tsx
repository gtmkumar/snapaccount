import { type ReactNode, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CardPadding = 'none' | 'sm' | 'md' | 'lg'
type CardShadow = 'none' | 'sm' | 'md'
type CardRadius = 'md' | 'lg' | 'xl'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
  shadow?: CardShadow
  radius?: CardRadius
  border?: boolean
  clickable?: boolean
  selected?: boolean
  children: ReactNode
}

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

const shadowClasses: Record<CardShadow, string> = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
}

const radiusClasses: Record<CardRadius, string> = {
  md: 'rounded-xl',
  lg: 'rounded-xl',
  xl: 'rounded-2xl',
}

export function Card({
  padding = 'md',
  shadow = 'sm',
  radius = 'lg',
  border = false,
  clickable = false,
  selected = false,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-white transition-all duration-200',
        paddingClasses[padding],
        shadowClasses[shadow],
        radiusClasses[radius],
        !selected && !border && 'shadow-sm',
        border && !selected && 'border border-neutral-200',
        selected && 'ring-2 ring-brand-500 shadow-md',
        clickable && !selected && 'cursor-pointer hover:shadow-md hover:-translate-y-px',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-neutral-800">{title}</h3>
        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('pt-4 mt-4 border-t border-neutral-200', className)}>
      {children}
    </div>
  )
}
