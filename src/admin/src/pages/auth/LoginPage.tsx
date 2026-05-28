import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Button } from '@/components/ui/Button'

const LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true'

export default function LoginPage() {
  const { user, loading, error, signInWithGoogle, signInWithEmailPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/dashboard'

  const [email, setEmail] = useState('admin@snapaccount.local')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (user && !loading) {
      void navigate(from, { replace: true })
    }
  }, [user, loading, navigate, from])

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-400 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
              <span className="text-white font-extrabold text-2xl" aria-hidden="true">SA</span>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-neutral-900">SnapAccount</h1>
              <p className="text-neutral-500 mt-1 text-sm">SME Financial Platform</p>
            </div>
          </div>

          {/* Welcome */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-neutral-800">Welcome back</h2>
            <p className="text-sm text-neutral-500 mt-1">
              {LOCAL_AUTH
                ? 'Sign in with your local development credentials'
                : 'Sign in with your SnapAccount organization Google account to continue'}
            </p>
          </div>

          {/* Error */}
          {error && (
            <AlertBanner
              type="error"
              title="Sign in failed"
              description={error}
              className="mb-6"
            />
          )}

          {LOCAL_AUTH ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void signInWithEmailPassword(email, password)
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border border-neutral-200 px-3 py-2.5 text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="admin@snapaccount.local"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-neutral-200 px-3 py-2.5 text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="••••••••"
                />
              </label>
              <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                Sign in
              </Button>
              <p className="text-xs text-neutral-400 text-center mt-2">
                Local dev mode — seeded admin: <code>admin@snapaccount.local</code> / <code>Admin@12345</code>
              </p>
            </form>
          ) : (
            <>
              {/* Sign in button */}
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                loading={loading}
                onClick={() => void signInWithGoogle()}
                className="gap-3 border-neutral-200 text-neutral-700 hover:bg-neutral-50 shadow-sm"
                aria-label="Sign in with Google"
              >
                {!loading && (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>

              {/* Help text */}
              <p className="text-xs text-neutral-400 text-center mt-6">
                Access restricted to authorized SnapAccount staff only.
                <br />
                Contact your administrator if you need access.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/60 mt-6">
          SnapAccount Admin Panel — Secure Financial Operations
        </p>
      </div>
    </div>
  )
}
