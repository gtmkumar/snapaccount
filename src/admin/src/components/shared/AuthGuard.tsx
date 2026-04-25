import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth, type AdminRole } from '@/hooks/useAuth'

interface AuthGuardProps {
  children: ReactNode
  requiredRoles?: AdminRole[]
}

export function AuthGuard({ children, requiredRoles }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-base" aria-busy="true" aria-label="Loading...">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center">
            <span className="text-white font-bold text-xl">SA</span>
          </div>
          <div className="flex gap-2">
            <div className="h-2 w-2 rounded-full bg-brand-500 animate-bounce [animation-delay:0ms]" />
            <div className="h-2 w-2 rounded-full bg-brand-500 animate-bounce [animation-delay:150ms]" />
            <div className="h-2 w-2 rounded-full bg-brand-500 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
