/**
 * ResetPasswordPage — Task #20
 * POST /auth/password/reset { token, newPassword } -> 204 or 400 { error, code }
 * Reads token from URL query param: ?token=...
 * Public route — no auth guard.
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { resetPassword } from '@/lib/settingsApi'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

function getPasswordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const labels: string[] = ['', t('password.strength.weak'), t('password.strength.fair'), t('password.strength.good'), t('password.strength.strong')]
  const colors: string[] = ['', 'bg-rose-500', 'bg-amber-500', 'bg-blue-500', 'bg-success-500']
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] ?? '', color: colors[score] ?? '' }
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[var(--brand-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-base" aria-hidden="true">SA</span>
          </div>
          <span className="text-xl font-bold text-[var(--text-primary)]">SnapAccount</span>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-md)] border border-[var(--border-subtle)] p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; api?: string }>({})
  const [success, setSuccess] = useState(false)

  const strength = getPasswordStrength(password)

  const mutation = useMutation({
    mutationFn: () => resetPassword(token, password),
    onSuccess: () => setSuccess(true),
    onError: (err: unknown) => {
      let msg = t('resetPassword.error.generic')
      if (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'code' in err.response.data
      ) {
        const code = (err.response.data as Record<string, unknown>).code
        if (code === 'TOKEN_EXPIRED') msg = t('resetPassword.error.tokenExpired')
        else if (code === 'TOKEN_INVALID') msg = t('resetPassword.error.tokenInvalid')
      }
      setErrors((prev) => ({ ...prev, api: msg }))
    },
  })

  function validate(): boolean {
    const errs: typeof errors = {}
    if (password.length < 8) errs.password = t('resetPassword.passwordTooShort')
    if (password !== confirm) errs.confirm = t('resetPassword.passwordMismatch')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      setErrors({ api: t('resetPassword.error.noToken') })
      return
    }
    setErrors({})
    if (validate()) {
      mutation.mutate()
    }
  }

  const inputClass = (hasError?: boolean) =>
    cn(
      'w-full px-3 py-2 pr-10 rounded-lg border text-sm',
      'bg-[var(--surface-sunken)] text-[var(--text-primary)]',
      'placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
      hasError ? 'border-rose-500' : 'border-[var(--border-default)]'
    )

  return (
    <AuthShell>
      {success ? (
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-success-50 mx-auto">
            <CheckCircle2 className="h-7 w-7 text-success-600" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('resetPassword.success.title')}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('resetPassword.success.desc')}
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('resetPassword.backToLogin')}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {t('resetPassword.title')}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {t('resetPassword.subtitle')}
            </p>
          </div>

          {!token && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {t('resetPassword.error.noToken')}
            </div>
          )}

          {errors.api && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {errors.api}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* New password */}
            <div>
              <label
                htmlFor="reset-pw"
                className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
              >
                {t('resetPassword.newPasswordLabel')}
              </label>
              <div className="relative">
                <input
                  id="reset-pw"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass(!!errors.password)}
                  aria-describedby={errors.password ? 'reset-pw-error' : 'reset-pw-strength'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label={showPw ? t('common.hidePassword') : t('common.showPassword')}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="reset-pw-error" className="mt-1 text-xs text-rose-600">
                  {errors.password}
                </p>
              )}
              {/* Strength indicator */}
              {password && (
                <div className="mt-2 space-y-1" id="reset-pw-strength">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors',
                          i <= strength.score ? strength.color : 'bg-neutral-200'
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label
                htmlFor="reset-confirm"
                className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
              >
                {t('resetPassword.confirmPasswordLabel')}
              </label>
              <div className="relative">
                <input
                  id="reset-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputClass(!!errors.confirm)}
                  aria-describedby={errors.confirm ? 'reset-confirm-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label={showConfirm ? t('common.hidePassword') : t('common.showPassword')}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm && (
                <p id="reset-confirm-error" className="mt-1 text-xs text-rose-600">
                  {errors.confirm}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={mutation.isPending}
              disabled={!token}
            >
              {t('resetPassword.cta')}
            </Button>
          </form>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('resetPassword.backToLogin')}
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  )
}
