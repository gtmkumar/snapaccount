/**
 * ForgotPasswordPage — Task #20
 * POST /auth/password/forgot { email } -> 204 always.
 * Shows a generic "if that email exists, a link was sent" message (no enumeration).
 * Public route — no auth guard.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { forgotPassword } from '@/lib/settingsApi'
import { t } from '@/i18n'

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[var(--brand-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-base" aria-hidden="true">SA</span>
          </div>
          <span className="text-xl font-bold text-[var(--text-primary)]">SnapAccount</span>
        </div>
        {/* Card */}
        <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-md)] border border-[var(--border-subtle)] p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: () => forgotPassword(email),
    onSuccess: () => setSubmitted(true),
    // Always show success even on error (anti-enumeration)
    onError: () => setSubmitted(true),
  })

  function validate(): boolean {
    if (!email.trim()) {
      setEmailError(t('forgotPassword.emailRequired'))
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t('forgotPassword.emailInvalid'))
      return false
    }
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    if (validate()) {
      mutation.mutate()
    }
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] text-sm'

  return (
    <AuthShell>
      {submitted ? (
        /* Success state */
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-success-50 mx-auto">
            <Mail className="h-7 w-7 text-success-600" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('forgotPassword.sentTitle')}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {t('forgotPassword.sentDesc')}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {t('forgotPassword.sentHint')}
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-primary)] hover:underline mt-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('forgotPassword.backToLogin')}
          </Link>
        </div>
      ) : (
        /* Form state */
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {t('forgotPassword.title')}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {t('forgotPassword.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
              >
                {t('forgotPassword.emailLabel')}
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setEmailError('')
                }}
                placeholder={t('forgotPassword.emailPlaceholder')}
                className={inputClass}
                aria-describedby={emailError ? 'forgot-email-error' : undefined}
              />
              {emailError && (
                <p id="forgot-email-error" className="mt-1 text-xs text-rose-600">
                  {emailError}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={mutation.isPending}
            >
              {t('forgotPassword.cta')}
            </Button>
          </form>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  )
}
