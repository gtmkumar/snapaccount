/**
 * InviteAcceptancePage — Auth/RBAC Module 1
 * PUBLIC route: /invite/:token
 * Validates token, shows invite details, set-password or link-account form.
 * Must NOT be wrapped in AuthGuard or AppShell.
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { t } from '@/i18n'
import { Eye, EyeOff, Clock, Ban, CheckCircle, AlertCircle, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { RoleChip } from '@/components/ui/RoleChip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { validateInviteToken, acceptInvite } from '@/lib/rbacApi'
import type { AdminRole } from '@/hooks/useAuth'

// ─────────────────────────────────────────────────────────────────────────────
// Password strength helper
// ─────────────────────────────────────────────────────────────────────────────

function getPasswordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['', 'bg-rose-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500']
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score], color: colors[score] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function InviteAcceptancePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'set-password' | 'link-account'>('set-password')

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ['invite', 'validate', token],
    queryFn: () => validateInviteToken(token!),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  })

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">{t('invite.checking')}</p>
        </div>
      </AuthShell>
    )
  }

  // ── Invalid / network error ──────────────────────────────────────────────────

  if (error || !invite) {
    return (
      <AuthShell>
        <TerminalCard
          icon={<AlertCircle className="h-8 w-8 text-rose-500" />}
          bg="bg-rose-50 dark:bg-rose-950"
          title={t('invite.invalid.title')}
          body={t('invite.invalid.body')}
          cta={
            <Button variant="primary" onClick={() => navigate('/')}>
              {t('invite.invalid.cta')}
            </Button>
          }
        />
      </AuthShell>
    )
  }

  // ── Terminal states ──────────────────────────────────────────────────────────

  if (invite.status === 'EXPIRED') {
    return (
      <AuthShell>
        <TerminalCard
          icon={<Clock className="h-8 w-8 text-amber-500" />}
          bg="bg-amber-50 dark:bg-amber-950"
          title={t('invite.expired.title')}
          body={t('invite.expired.body')}
          cta={
            <a href="mailto:admin@snapaccount.in">
              <Button variant="ghost">{t('invite.expired.cta')}</Button>
            </a>
          }
        />
      </AuthShell>
    )
  }

  if (invite.status === 'REVOKED') {
    return (
      <AuthShell>
        <TerminalCard
          icon={<Ban className="h-8 w-8 text-neutral-500" />}
          bg="bg-neutral-50 dark:bg-neutral-900"
          title={t('invite.revoked.title')}
          body={t('invite.revoked.body')}
          cta={
            <a href="mailto:admin@snapaccount.in">
              <Button variant="ghost">{t('invite.revoked.cta')}</Button>
            </a>
          }
        />
      </AuthShell>
    )
  }

  if (invite.status === 'ACCEPTED') {
    return (
      <AuthShell>
        <TerminalCard
          icon={<CheckCircle className="h-8 w-8 text-emerald-500" />}
          bg="bg-emerald-50 dark:bg-emerald-950"
          title={t('invite.accepted.title')}
          body={t('invite.accepted.body')}
          cta={
            <Button variant="primary" onClick={() => navigate('/login')}>
              {t('invite.accepted.cta')}
            </Button>
          }
        />
      </AuthShell>
    )
  }

  // ── Valid invitation ─────────────────────────────────────────────────────────

  return (
    <AuthShell>
      <div className="space-y-6">
        {/* Invite summary card */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-[var(--brand-primary)] text-white flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{invite.organizationName}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-[var(--text-tertiary)]">{t('invite.role')}</span>
              <RoleChip role={invite.roleDisplayName as AdminRole} size="sm" />
            </div>
            {(invite.email ?? invite.phone) && (
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                {t('invite.invitedAs')} {invite.email ?? `+91 ${invite.phone}`}
              </p>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        {invite.accountExists && (
          <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            <button
              onClick={() => setMode('set-password')}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors',
                mode === 'set-password'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
              )}
            >
              {t('invite.newAccount')}
            </button>
            <button
              onClick={() => setMode('link-account')}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors',
                mode === 'link-account'
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
              )}
            >
              {t('invite.linkAccount')}
            </button>
          </div>
        )}

        {/* Form */}
        {mode === 'set-password' ? (
          <SetPasswordForm
            token={token!}
            orgName={invite.organizationName}
            onSuccess={() => navigate('/login')}
            onSwitchToLink={() => setMode('link-account')}
            hasExistingAccount={!!invite.accountExists}
          />
        ) : (
          <LinkAccountForm
            token={token!}
            orgName={invite.organizationName}
            onSuccess={() => navigate('/dashboard')}
          />
        )}
      </div>
    </AuthShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SetPasswordForm
// ─────────────────────────────────────────────────────────────────────────────

function SetPasswordForm({
  token, orgName, onSuccess, onSwitchToLink, hasExistingAccount,
}: {
  token: string
  orgName: string
  onSuccess: () => void
  onSwitchToLink: () => void
  hasExistingAccount: boolean
}) {
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const strength = getPasswordStrength(password)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!displayName.trim()) errs.displayName = t('invite.field.nameRequired')
    if (password.length < 8) errs.password = t('invite.field.passwordTooShort')
    if (password !== confirmPassword) errs.confirmPassword = t('invite.field.passwordMismatch')
    if (!acceptedTerms) errs.terms = t('invite.field.termsRequired')
    return errs
  }

  const mutation = useMutation({
    mutationFn: () => acceptInvite(token, { displayName: displayName.trim(), password, acceptedTerms }),
    onSuccess: data => {
      toast.success(t('invite.welcomeToOrg', { org: data.organizationName }))
      onSuccess()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 400) {
        toast.error(t('invite.invalidData'))
      } else {
        toast.error(t('invite.acceptError'))
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        {t('invite.setPassword.heading', { org: orgName })}
      </h2>

      {/* Full name */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
          {t('invite.field.fullName')} <span className="text-rose-500">*</span>
        </label>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Riya Sharma"
          autoFocus
          className={cn(
            'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
            errors.displayName ? 'border-rose-500' : 'border-[var(--border-default)]'
          )}
        />
        {errors.displayName && <p className="mt-1 text-xs text-rose-600">{errors.displayName}</p>}
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
          {t('invite.field.password')} <span className="text-rose-500">*</span>
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-describedby="pwd-strength"
            className={cn(
              'w-full px-3 py-2 pr-10 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
              errors.password ? 'border-rose-500' : 'border-[var(--border-default)]'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {/* Strength meter */}
        {password && (
          <div id="pwd-strength" className="mt-2">
            <div className="flex gap-1 mb-1">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    i <= strength.score ? strength.color : 'bg-neutral-200 dark:bg-neutral-700'
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">{strength.label}</p>
          </div>
        )}
        {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password}</p>}
      </div>

      {/* Confirm password */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
          {t('invite.field.confirmPassword')} <span className="text-rose-500">*</span>
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className={cn(
            'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
            errors.confirmPassword ? 'border-rose-500' : 'border-[var(--border-default)]'
          )}
        />
        {errors.confirmPassword && <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword}</p>}
      </div>

      {/* Terms */}
      <div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={e => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)] text-[var(--brand-primary)]"
          />
          <span className="text-sm text-[var(--text-secondary)]">
            {t('invite.terms.prefix')}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[var(--brand-primary)] hover:underline">
              {t('invite.terms.link')}
            </a>
          </span>
        </label>
        {errors.terms && <p className="mt-1 text-xs text-rose-600">{errors.terms}</p>}
      </div>

      <Button
        type="submit"
        variant="primary"
        className="w-full justify-center"
        loading={mutation.isPending}
        disabled={!displayName || !password || !confirmPassword || !acceptedTerms}
      >
        {t('invite.acceptCta')}
      </Button>

      {!hasExistingAccount && (
        <p className="text-center text-sm text-[var(--text-tertiary)]">
          {t('invite.alreadyHaveAccount')}{' '}
          <button
            type="button"
            onClick={onSwitchToLink}
            className="text-[var(--brand-primary)] hover:underline font-medium"
          >
            {t('invite.linkInstead')}
          </button>
        </p>
      )}
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LinkAccountForm
// ─────────────────────────────────────────────────────────────────────────────

function LinkAccountForm({
  token, orgName, onSuccess,
}: {
  token: string
  orgName: string
  onSuccess: () => void
}) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const mutation = useMutation({
    mutationFn: () => acceptInvite(token, {}),
    onSuccess: data => {
      toast.success(t('invite.welcomeToOrg', { org: data.organizationName }))
      onSuccess()
    },
    onError: () => toast.error(t('invite.acceptError')),
  })

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        {t('invite.linkAccount.heading', { org: orgName })}
      </h2>
      <p className="text-sm text-[var(--text-secondary)]">
        {t('invite.linkAccount.body')}
      </p>

      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
          {t('invite.field.password')}
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 pr-10 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        variant="primary"
        className="w-full justify-center"
        onClick={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!password}
      >
        {t('invite.signInAndAccept')}
      </Button>

      <p className="text-center text-sm text-[var(--text-tertiary)]">
        <a href="/forgot-password" className="text-[var(--brand-primary)] hover:underline">
          {t('invite.forgotPassword')}
        </a>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthShell — centered card layout (matches login page pattern)
// ─────────────────────────────────────────────────────────────────────────────

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[var(--brand-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-base">SA</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// TerminalCard — expired / revoked / accepted / invalid states
// ─────────────────────────────────────────────────────────────────────────────

function TerminalCard({
  icon, bg, title, body, cta,
}: {
  icon: React.ReactNode
  bg: string
  title: string
  body: string
  cta?: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl p-6 flex flex-col items-center text-center gap-4', bg)}>
      <div className="p-3 rounded-full bg-white/60 dark:bg-black/20">{icon}</div>
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="text-sm text-[var(--text-secondary)]">{body}</p>
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  )
}
