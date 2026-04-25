/**
 * ErrorBoundary — Phase 6F Track F1
 * Per-pane and route-level error isolation.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type BoundaryScope = 'pane' | 'route'

interface ErrorBoundaryProps {
  scope?: BoundaryScope
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    // Log to backend /clientErrors (fire-and-forget)
    try {
      void fetch('/clientErrors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 500),
          component: errorInfo.componentStack?.slice(0, 500),
          url: window.location.pathname,
          ts: new Date().toISOString(),
        }),
      })
    } catch {
      // Ignore — monitoring is best-effort
    }
  }

  reset = () => this.setState({ error: null, errorInfo: null })

  render() {
    const { error } = this.state
    const { scope = 'route', fallback, children } = this.props

    if (!error) return children

    if (fallback) return fallback

    if (scope === 'pane') {
      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6 rounded-xl',
            'bg-[var(--surface-raised)] border border-amber-200 dark:border-amber-800',
            'text-center'
          )}
          role="alert"
        >
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Something went wrong here</p>
          <p className="text-xs text-[var(--text-tertiary)] max-w-[24ch]">{error.message}</p>
          <button
            onClick={this.reset}
            className="flex items-center gap-1.5 text-xs text-[var(--brand-primary)] hover:underline mt-1"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )
    }

    // Route-level
    return (
      <div
        className="flex items-center justify-center min-h-screen bg-[var(--surface-canvas)] p-6"
        role="alert"
      >
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-950">
              <AlertTriangle className="h-12 w-12 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Something went wrong</h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">{error.message}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
