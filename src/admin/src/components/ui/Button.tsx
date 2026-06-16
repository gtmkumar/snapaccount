import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  ariaLabel?: string
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-gradient-to-br from-brand-500 to-brand-700 text-white font-semibold',
    'hover:from-brand-600 hover:to-brand-800 hover:scale-[1.02]',
    'active:scale-95',
    'disabled:from-neutral-300 disabled:to-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed disabled:scale-100',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2',
  ].join(' '),
  secondary: [
    'bg-[var(--surface-raised)] border-2 border-brand-500 text-brand-600 font-semibold',
    'hover:bg-[var(--surface-hover)]',
    'active:bg-[var(--surface-active)] active:scale-95',
    'disabled:border-[var(--border-default)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed disabled:scale-100',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-brand-600 font-medium',
    'hover:bg-[var(--surface-hover)]',
    'active:bg-[var(--surface-active)] active:scale-95',
    'disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed disabled:scale-100',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]',
  ].join(' '),
  danger: [
    'bg-error-600 text-white font-semibold',
    'hover:bg-error-700 hover:scale-[1.02]',
    'active:scale-95',
    'disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed disabled:scale-100',
    'focus-visible:ring-2 focus-visible:ring-error-600/30 focus-visible:ring-offset-2',
  ].join(' '),
  icon: [
    'bg-transparent text-[var(--text-tertiary)] rounded-lg',
    'hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]',
    'active:bg-[var(--surface-active)] active:scale-95',
    'disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed disabled:scale-100',
    'focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]',
  ].join(' '),
  success: [
    'bg-green-600 text-white font-semibold border-transparent',
    'hover:bg-green-700 hover:scale-[1.02]',
    'active:bg-green-800 active:scale-95',
    'disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed disabled:scale-100',
    'focus-visible:ring-2 focus-visible:ring-green-600/30 focus-visible:ring-offset-2',
  ].join(' '),
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-base rounded-lg gap-2',
  lg: 'h-13 px-6 text-lg rounded-lg gap-2',
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 w-9 rounded-lg',
  md: 'h-11 w-11 rounded-xl',
  lg: 'h-13 w-13 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      ariaLabel,
      children,
      className,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isIcon = variant === 'icon'
    const isDisabled = disabled ?? loading

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-busy={loading}
        className={cn(
          'inline-flex items-center justify-center transition-all duration-200 select-none outline-none',
          variantClasses[variant],
          isIcon ? iconSizeClasses[size] : sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {!isIcon && <span className="ml-2">{children}</span>}
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0" aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0" aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
