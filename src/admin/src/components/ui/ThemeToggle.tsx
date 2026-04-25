/**
 * ThemeToggle — Phase 6F Track F1
 * Sun/Moon/System cycle button for TopBar.
 * Single click: cycles light → dark → system
 */
import { useRef, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { preference, effectiveTheme, cycleTheme, setPreference } = useTheme()
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const Icon = ICONS[preference]

  const handlePointerDown = () => {
    longPressTimeout.current = setTimeout(() => {
      setMenuOpen(true)
    }, 600)
  }

  const handlePointerUp = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current)
      longPressTimeout.current = null
    }
  }

  const handleClick = () => {
    if (!menuOpen) {
      cycleTheme()
    }
  }

  const options: ThemePreference[] = ['light', 'dark', 'system']
  const labels: Record<ThemePreference, string> = {
    light: t('theme.toggle.light', 'Light'),
    dark: t('theme.toggle.dark', 'Dark'),
    system: t('theme.toggle.system', 'System default'),
  }

  return (
    <div className={cn('relative', className)}>
      {/* Live region for screen readers */}
      <span
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {menuOpen ? '' : t('theme.announce.changed', { theme: effectiveTheme, defaultValue: 'Theme changed to {{theme}}' })}
      </span>

      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        aria-label={t('theme.toggle.label', 'Toggle theme')}
        aria-pressed={preference !== 'system'}
        aria-haspopup="menu"
        className={cn(
          'flex items-center justify-center h-9 w-9 rounded-lg',
          'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
          'transition-colors duration-150',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className={cn(
              'absolute right-0 top-full mt-1 z-50 w-44',
              'bg-[var(--surface-raised)] rounded-lg shadow-[var(--shadow-md)]',
              'border border-[var(--border-subtle)] py-1'
            )}
          >
            {options.map((opt) => (
              <button
                key={opt}
                role="menuitem"
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-sm',
                  'text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
                  'transition-colors',
                  preference === opt && 'font-medium text-[var(--brand-primary)]'
                )}
                onClick={() => {
                  setPreference(opt)
                  setMenuOpen(false)
                }}
              >
                {(() => {
                  const OptionIcon = ICONS[opt]
                  return <OptionIcon className="h-4 w-4" aria-hidden="true" />
                })()}
                {labels[opt]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
