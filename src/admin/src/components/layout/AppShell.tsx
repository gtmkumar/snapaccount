import { useState, useEffect, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { cn } from '@/lib/utils'
import { CommandPaletteWrapper } from '@/components/ui/CommandPalette'
import { KeyboardShortcutsOverlay } from '@/components/ui/KeyboardShortcutsOverlay'
import { t } from '@/i18n'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-canvas)]">
      {/* DG-ADMIN-05: Skip-to-content link — first focusable element, visible on focus */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          const main = document.getElementById('main-content')
          if (main) {
            main.focus()
            main.scrollIntoView()
          }
        }}
        className={cn(
          // Visually hidden until focused — then appears as a branded banner
          'sr-only focus:not-sr-only',
          'focus:fixed focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus:z-[100]',
          'focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg',
          'focus:bg-[var(--brand-primary)] focus:text-white focus:text-sm focus:font-medium',
          'focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white'
        )}
      >
        {t('a11y.skipToContent')}
      </a>

      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 md:relative md:z-auto md:flex',
          'transition-transform duration-300',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(prev => !prev)}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMobileMenuToggle={() => setMobileSidebarOpen(prev => !prev)} />

        <main
          className={cn(
            'flex-1 overflow-y-auto p-4 md:p-6',
            'focus:outline-none bg-[var(--surface-canvas)]'
          )}
          tabIndex={-1}
          id="main-content"
          aria-label="Main content"
        >
          {children}
        </main>
      </div>

      {/* Global overlays */}
      <CommandPaletteWrapper />
      <KeyboardShortcutsOverlay />
    </div>
  )
}
