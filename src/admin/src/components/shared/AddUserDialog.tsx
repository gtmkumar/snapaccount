/**
 * AddUserDialog — Auth/RBAC Module 1, Increment 1.3
 *
 * Creates an admin/platform or org-scoped user with role + optional
 * per-user permission overrides. Wired into UserListPage.
 *
 * i18n: @/i18n t() (NOT react-i18next).
 * No new design tokens or components — reuses Module 1 / Increment 1.1 primitives.
 */
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Eye, EyeOff, Info, AlertTriangle,
  ChevronDown, ChevronRight, Shield,
} from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { t } from '@/i18n'
import {
  listAssignableRoles, createAdminUser,
  type AssignableRole, type AdminUserApiErrorCode,
} from '@/lib/userAdminApi'
import {
  listPermissions, getGrantablePermissions,
  listOrganizations,
  type PermissionModule, type CatalogPermission,
} from '@/lib/rbacApi'
import {
  UserAttributeFields, emptyUserAttributes, validateUserAttributes, toProfileInput,
  type UserAttributesValue,
} from '@/components/shared/UserAttributeFields'
import {
  getPasswordStrength, PWD_COLORS, OverrideModuleSection,
} from '@/components/shared/userDialogParts'

// ── Constants ─────────────────────────────────────────────────────────────────
const IS_DEV = import.meta.env.VITE_LOCAL_AUTH === 'true' || import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AddUserDialogProps {
  open: boolean
  onClose: () => void
  /** Whether the caller holds platform.admins.invite (enables Platform scope) */
  canInvitePlatform: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dialog
// ─────────────────────────────────────────────────────────────────────────────

export function AddUserDialog({ open, onClose, canInvitePlatform }: AddUserDialogProps) {
  const queryClient = useQueryClient()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [scope, setScope] = useState<'platform' | 'org'>(canInvitePlatform ? 'platform' : 'org')
  const [orgId, setOrgId] = useState('')
  const [orgSearch, setOrgSearch] = useState('')
  const [orgDropOpen, setOrgDropOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  // Override toggles: set of permissionIds the user has explicitly toggled ON
  const [overrides, setOverrides] = useState<Set<string>>(new Set())
  // Filter for the override matrix
  const [permFilter, setPermFilter] = useState('')
  // Which modules are expanded in the override matrix
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  // Show the effective perms list
  const [showEffectiveList, setShowEffectiveList] = useState(false)
  // Attribute + KYC/profile fields (shared with EditUserDialog)
  const [attrs, setAttrs] = useState<UserAttributesValue>(emptyUserAttributes())

  // ── Validation errors ────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [contactError, setContactError] = useState('')

  // ── Data queries ─────────────────────────────────────────────────────────────
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin', 'assignable-roles', scope],
    queryFn: () => listAssignableRoles(scope),
    enabled: open,
    staleTime: 2 * 60_000,
    retry: false,
  })

  const { data: catalog } = useQuery({
    queryKey: ['auth', 'permissions', 'catalog'],
    queryFn: () => listPermissions(),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const { data: grantableData } = useQuery({
    queryKey: ['auth', 'me', 'grantable-permissions'],
    queryFn: getGrantablePermissions,
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const { data: orgsData } = useQuery({
    queryKey: ['platform', 'organizations', { pageSize: 200 }],
    queryFn: () => listOrganizations({ pageSize: 200 }),
    enabled: open && scope === 'org',
    staleTime: 2 * 60_000,
  })

  const grantableIds = useMemo(() => new Set(grantableData?.grantablePermissionIds ?? []), [grantableData])

  // ── Selected role + inherited perms ─────────────────────────────────────────
  const selectedRole: AssignableRole | undefined = roles?.find(r => r.id === selectedRoleId)
  const inheritedPermIds = useMemo(
    () => new Set((selectedRole?.permissions ?? []).map(p => p.permissionId)),
    [selectedRole],
  )

  // ── Org filtering ────────────────────────────────────────────────────────────
  const filteredOrgs = useMemo(() => {
    const items = orgsData?.items ?? []
    if (!orgSearch) return items
    const q = orgSearch.toLowerCase()
    return items.filter(o => o.businessName.toLowerCase().includes(q) || (o.gstin ?? '').toLowerCase().includes(q))
  }, [orgsData, orgSearch])

  const selectedOrg = useMemo(() => orgsData?.items.find(o => o.id === orgId), [orgsData, orgId])

  // ── Permission filter + catalog ──────────────────────────────────────────────
  const filteredCatalog: PermissionModule[] = useMemo(() => {
    if (!catalog) return []
    return catalog.map(m => ({
      ...m,
      permissions: m.permissions.filter(p => {
        if (!permFilter) return true
        const q = permFilter.toLowerCase()
        return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
      }),
    })).filter(m => m.permissions.length > 0)
  }, [catalog, permFilter])

  // ── Effective permissions (role ∪ overrides) ─────────────────────────────────
  const effectivePermIds: Set<string> = useMemo(() => {
    const all = new Set(inheritedPermIds)
    overrides.forEach(id => { if (!inheritedPermIds.has(id)) all.add(id) })
    return all
  }, [inheritedPermIds, overrides])

  const effectiveCount = effectivePermIds.size
  const rolePermCount = inheritedPermIds.size
  const overrideCount = effectiveCount - rolePermCount

  // ── Catalog perms by id for effective list rendering ─────────────────────────
  const permById = useMemo(() => {
    const m = new Map<string, CatalogPermission>()
    catalog?.forEach(mod => mod.permissions.forEach(p => m.set(p.id, p)))
    return m
  }, [catalog])

  // ── Reset on open/scope change ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setScope(canInvitePlatform ? 'platform' : 'org')
    setOrgId(''); setOrgSearch(''); setFullName(''); setEmail(''); setPhone('')
    setPassword(''); setSelectedRoleId(''); setOverrides(new Set())
    setPermFilter(''); setExpandedModules(new Set()); setErrors({}); setContactError('')
    setShowEffectiveList(false); setAttrs(emptyUserAttributes())
  }, [open, canInvitePlatform])

  // Expand all modules when catalog first loads
  useEffect(() => {
    if (catalog && expandedModules.size === 0) {
      setExpandedModules(new Set(catalog.map(m => m.module)))
    }
  }, [catalog, expandedModules.size])

  // ── Scope switch: reset role + overrides ─────────────────────────────────────
  const handleScopeSwitch = (next: 'platform' | 'org') => {
    if (next === scope) return
    if (overrides.size > 0 && !window.confirm(t('users.addUser.scopeSwitchConfirm'))) return
    setScope(next)
    setSelectedRoleId('')
    setOverrides(new Set())
  }

  // ── Override toggle ──────────────────────────────────────────────────────────
  const toggleOverride = (permId: string) => {
    if (inheritedPermIds.has(permId)) return // inherited — not toggleable
    if (!grantableIds.has(permId)) return    // not grantable — blocked
    setOverrides(prev => {
      const next = new Set(prev)
      if (next.has(permId)) next.delete(permId)
      else next.add(permId)
      return next
    })
  }

  const toggleModuleAll = (module: PermissionModule) => {
    const grantableNotInherited = module.permissions.filter(
      p => grantableIds.has(p.id) && !inheritedPermIds.has(p.id)
    )
    const allOn = grantableNotInherited.every(p => overrides.has(p.id))
    setOverrides(prev => {
      const next = new Set(prev)
      if (allOn) {
        grantableNotInherited.forEach(p => next.delete(p.id))
      } else {
        grantableNotInherited.forEach(p => next.add(p.id))
      }
      return next
    })
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!fullName.trim()) errs.fullName = t('users.addUser.err.nameRequired')
    if (!email.trim() && !phone.trim()) {
      setContactError(t('users.addUser.err.contactRequired'))
    } else {
      setContactError('')
    }
    if (!selectedRoleId) errs.role = t('users.addUser.err.roleRequired')
    if (scope === 'org' && !orgId) errs.org = t('users.addUser.err.orgRequired')
    if (password && getPasswordStrength(password).score < 2) {
      errs.password = t('users.addUser.err.passwordWeak')
    }
    Object.assign(errs, validateUserAttributes(attrs))
    setErrors(errs)
    return Object.keys(errs).length === 0 && !contactError && !!selectedRoleId && (scope !== 'org' || !!orgId)
  }

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => createAdminUser({
      fullName: fullName.trim(),
      email: email.trim() || undefined,
      phoneNumber: phone.trim() ? `+91${phone.trim()}` : undefined,
      scope,
      roleId: selectedRoleId,
      organizationId: scope === 'org' ? orgId : undefined,
      permissionIds: overrides.size > 0 ? Array.from(overrides) : undefined,
      initialPassword: password || undefined,
      preferredLanguage: attrs.preferredLanguage || undefined,
      userType: attrs.userType || undefined,
      isActive: attrs.isActive,
      profile: toProfileInput(attrs),
    }),
    onSuccess: () => {
      toast.success(t('users.addUser.success', { name: fullName.trim() }))
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onClose()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response?.status
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as AdminUserApiErrorCode | undefined

      if (status === 409 && (code === 'User.EmailConflict' || code === 'User.PhoneConflict')) {
        setContactError(t('users.addUser.err.duplicate'))
      } else if (status === 403 && (code === 'Role.PrivilegeEscalation' || code === 'User.PrivilegeEscalation')) {
        toast.error(t('users.addUser.err.escalation'))
        // Revert escalating overrides — clear all and let user re-select
        setOverrides(new Set())
        setSelectedRoleId('')
      } else {
        toast.error(t('users.addUser.err.generic'))
      }
    },
  })

  const handleSubmit = () => {
    if (!validate()) return
    mutation.mutate()
  }

  const canSubmit = !!fullName.trim() && (!!email.trim() || !!phone.trim()) && !!selectedRoleId &&
    (scope !== 'org' || !!orgId) && !mutation.isPending

  // ── Password strength ─────────────────────────────────────────────────────────
  const pwdStrength = getPasswordStrength(password)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('users.addUser.title')}
      description={t('users.addUser.subtitle')}
      size="xl"
      scrollable
      footer={
        <>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={mutation.isPending}
            disabled={!canSubmit}
          >
            {t('users.addUser.submit')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-6 py-2">

        {/* ── Scope ─────────────────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            {t('users.addUser.scope')} <span className="text-rose-500">*</span>
          </p>
          <div role="radiogroup" aria-label={t('users.addUser.scope')} className="flex rounded-lg border border-[var(--border-default)] overflow-hidden self-start">
            {(['platform', 'org'] as const).map(s => {
              const disabled = s === 'platform' && !canInvitePlatform
              return (
                <button
                  key={s}
                  role="radio"
                  aria-checked={scope === s}
                  aria-disabled={disabled}
                  disabled={disabled}
                  title={disabled ? t('users.addUser.platformDisabled') : undefined}
                  onClick={() => handleScopeSwitch(s)}
                  className={cn(
                    'px-5 py-2 text-sm font-medium transition-colors',
                    scope === s
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]',
                    disabled && 'opacity-50 cursor-not-allowed hover:bg-[var(--surface-sunken)]'
                  )}
                >
                  {s === 'platform' ? t('users.addUser.scope.platform') : t('users.addUser.scope.org')}
                </button>
              )
            })}
          </div>

          {/* Platform caveat */}
          {scope === 'platform' && (
            <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-500 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
              <p className="text-sm">{t('users.addUser.platformCaveat')}</p>
            </div>
          )}

          {/* Org picker */}
          {scope === 'org' && (
            <div className="mt-3 relative">
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                {t('users.addUser.org')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  value={selectedOrg ? selectedOrg.businessName : orgSearch}
                  onChange={e => { setOrgSearch(e.target.value); setOrgId(''); setOrgDropOpen(true) }}
                  onFocus={() => setOrgDropOpen(true)}
                  onBlur={() => setTimeout(() => setOrgDropOpen(false), 150)}
                  placeholder={t('users.addUser.orgPlaceholder')}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                    errors.org ? 'border-rose-500' : 'border-[var(--border-default)]'
                  )}
                />
                {orgDropOpen && filteredOrgs.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] max-h-48 overflow-y-auto">
                    {filteredOrgs.map(o => (
                      <button
                        key={o.id}
                        onMouseDown={() => { setOrgId(o.id); setOrgSearch(''); setOrgDropOpen(false); setErrors(prev => ({ ...prev, org: '' })) }}
                        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                      >
                        <span className="font-medium">{o.businessName}</span>
                        {o.gstin && <span className="ml-2 text-xs font-mono text-[var(--text-tertiary)]">{o.gstin}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.org && <p className="mt-1 text-xs text-rose-600">{errors.org}</p>}
            </div>
          )}
        </div>

        {/* ── Identity ──────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
            Identity
          </p>

          {/* Full name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('users.addUser.fullName')} <span className="text-rose-500">*</span>
            </label>
            <input
              value={fullName}
              onChange={e => { setFullName(e.target.value); setErrors(prev => ({ ...prev, fullName: '' })) }}
              placeholder="Riya Sharma"
              autoFocus
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                errors.fullName ? 'border-rose-500' : 'border-[var(--border-default)]'
              )}
            />
            {errors.fullName && <p className="mt-1 text-xs text-rose-600">{errors.fullName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                {t('users.addUser.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setContactError('') }}
                placeholder="riya@acme.in"
                className={cn(
                  'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                  contactError ? 'border-rose-500' : 'border-[var(--border-default)]'
                )}
              />
            </div>

            {/* Phone — +91 prefix chip */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                {t('users.addUser.phone')}
              </label>
              <div className={cn(
                'flex items-center rounded-lg border overflow-hidden bg-[var(--surface-sunken)]',
                contactError ? 'border-rose-500' : 'border-[var(--border-default)]'
              )}>
                <span className="shrink-0 px-2.5 py-2 text-sm font-mono font-medium text-[var(--text-secondary)] bg-[var(--surface-sunken)] border-r border-[var(--border-default)]">
                  +91
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setContactError('') }}
                  placeholder="98765 43210"
                  aria-label={t('users.addUser.phone')}
                  aria-describedby="phone-format-hint"
                  className="flex-1 px-3 py-2 text-sm bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none"
                />
              </div>
              <p id="phone-format-hint" className="mt-1 text-xs text-[var(--text-tertiary)]">10 digits, starts with 6-9</p>
            </div>
          </div>
          {contactError && <p className="text-xs text-rose-600">{contactError}</p>}

          {/* Initial password — DEV only */}
          {IS_DEV && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-tertiary)] mb-1.5">
                {t('users.addUser.password')}
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">DEV</span>
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: '' })) }}
                  aria-describedby="pwd-hint pwd-strength"
                  className={cn(
                    'w-full px-3 py-2 pr-10 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                    errors.password ? 'border-rose-500' : 'border-[var(--border-default)]'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label={showPwd ? t('common.hidePassword') : t('common.showPassword')}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div id="pwd-strength" className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={cn('h-1.5 flex-1 rounded-full', i <= pwdStrength.score ? PWD_COLORS[pwdStrength.score] : 'bg-neutral-200 dark:bg-neutral-700')} />
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">{pwdStrength.label}</p>
                </div>
              )}
              <p id="pwd-hint" className="mt-1 text-xs text-[var(--text-tertiary)]">{t('users.addUser.passwordHint')}</p>
              {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password}</p>}
            </div>
          )}
        </div>

        {/* ── Attributes + KYC profile ──────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
            {t('users.attrs.section')}
          </p>
          <UserAttributeFields
            value={attrs}
            onChange={patch => { setAttrs(prev => ({ ...prev, ...patch })); setErrors(prev => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map(k => [k, ''])) })) }}
            errors={errors}
            enabled={open}
            idPrefix="add"
          />
        </div>

        {/* ── Role ──────────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
            {t('users.addUser.role')} <span className="text-rose-500">*</span>
          </p>

          {rolesLoading ? (
            <Skeleton variant="list" />
          ) : !roles?.length ? (
            <p className="text-sm text-[var(--text-tertiary)] py-2">{t('users.addUser.err.roleRequired')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {roles.map(role => {
                const isSelected = selectedRoleId === role.id
                // A role is non-assignable when its permissionCount > grantable set
                // We approximate by checking: if the role is a system-only one and the user
                // lacks platform.admins.invite for platform scope.
                // The server is authoritative; we let the user try and handle 403.
                return (
                  <label
                    key={role.id}
                    className={cn(
                      'flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors',
                      isSelected
                        ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                        : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.id}
                      checked={isSelected}
                      onChange={() => { setSelectedRoleId(role.id); setErrors(prev => ({ ...prev, role: '' })) }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{role.displayName}</span>
                        {role.isSystemRole && (
                          <span className="text-xs px-1 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">sys</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {t('users.addUser.inheritedCount', { count: role.permissionCount })}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          {errors.role && <p className="text-xs text-rose-600">{errors.role}</p>}

          {/* Inherited permissions preview */}
          {selectedRole && selectedRole.permissions && selectedRole.permissions.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--text-secondary)] select-none py-1">
                {t('users.addUser.inheritedTitle')} ({selectedRole.permissions.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedRole.permissions.map(p => (
                  <code key={p.permissionId} className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                    {p.name}
                  </code>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* ── Permission overrides ───────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
            {t('users.addUser.overrides')}
          </p>

          {/* Info callout */}
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 text-blue-800 dark:text-blue-200">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" aria-hidden="true" />
            <p className="text-xs">{t('users.addUser.overridesNote')}</p>
          </div>

          {/* Filter */}
          <input
            type="search"
            value={permFilter}
            onChange={e => setPermFilter(e.target.value)}
            placeholder={t('users.addUser.overridesFilter')}
            className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />

          {/* Module sections */}
          <div className="space-y-2">
            {filteredCatalog.map(module => (
              <OverrideModuleSection
                key={module.module}
                module={module}
                isExpanded={expandedModules.has(module.module)}
                onToggleExpand={() => setExpandedModules(prev => {
                  const next = new Set(prev)
                  if (next.has(module.module)) next.delete(module.module)
                  else next.add(module.module)
                  return next
                })}
                overrides={overrides}
                inheritedPermIds={inheritedPermIds}
                grantableIds={grantableIds}
                onToggle={toggleOverride}
                onSelectAll={() => toggleModuleAll(module)}
              />
            ))}
          </div>
        </div>

        {/* ── Effective permissions summary ─────────────────────────────────── */}
        {selectedRoleId && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 space-y-2">
            <p className="text-sm text-[var(--text-primary)]" aria-live="polite">
              {t('users.addUser.effectiveSummary', {
                total: effectiveCount,
                roleCount: rolePermCount,
                overrideCount,
              })}
            </p>
            {effectiveCount > 0 && (
              <button
                onClick={() => setShowEffectiveList(v => !v)}
                className="flex items-center gap-1 text-xs text-[var(--brand-primary)] hover:underline"
              >
                {showEffectiveList ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {t('users.addUser.effectiveViewList')}
              </button>
            )}
            {showEffectiveList && (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pt-1">
                {Array.from(effectivePermIds).map(id => {
                  const perm = permById.get(id)
                  const isOverride = !inheritedPermIds.has(id)
                  return (
                    <code
                      key={id}
                      className={cn(
                        'text-xs font-mono px-1.5 py-0.5 rounded',
                        isOverride
                          ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                          : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]'
                      )}
                    >
                      {perm?.name ?? id}
                    </code>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
