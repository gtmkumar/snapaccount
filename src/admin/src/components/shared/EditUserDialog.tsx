/**
 * EditUserDialog — Auth/RBAC Module 1, Increment 1.4 Phase B
 *
 * Edits an existing user: name, attributes (language/userType/active), KYC profile,
 * role (within the user's existing scope) and permission overrides. Email, phone,
 * scope and organization are immutable and shown read-only.
 *
 * Prefilled from GET /auth/admin/users/{id}. PAN is shown masked; leaving it blank
 * keeps the stored value, entering a new PAN replaces it (re-encrypted server-side).
 *
 * Delegation rules mirror create — the server is authoritative; 403s are surfaced.
 * i18n: @/i18n t() (NOT react-i18next).
 */
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Shield, Lock } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { t } from '@/i18n'
import {
  listAssignableRoles, updateAdminUser, getAdminUserDetail,
  type AssignableRole, type AdminUserApiErrorCode,
} from '@/lib/userAdminApi'
import {
  listPermissions, getGrantablePermissions,
  type PermissionModule, type CatalogPermission,
} from '@/lib/rbacApi'
import {
  UserAttributeFields, emptyUserAttributes, validateUserAttributes, toProfileInput,
  type UserAttributesValue,
} from '@/components/shared/UserAttributeFields'
import { OverrideModuleSection } from '@/components/shared/userDialogParts'

interface EditUserDialogProps {
  open: boolean
  onClose: () => void
  userId: string | null
}

export function EditUserDialog({ open, onClose, userId }: EditUserDialogProps) {
  const queryClient = useQueryClient()

  const [fullName, setFullName] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [overrides, setOverrides] = useState<Set<string>>(new Set())
  const [attrs, setAttrs] = useState<UserAttributesValue>(emptyUserAttributes())
  const [permFilter, setPermFilter] = useState('')
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [showEffectiveList, setShowEffectiveList] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Detail (prefill source) ──────────────────────────────────────────────────
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: () => getAdminUserDetail(userId!),
    enabled: open && !!userId,
    staleTime: 30_000,
  })

  const scope: 'platform' | 'org' = detail?.roleScope ?? 'platform'

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin', 'assignable-roles', scope],
    queryFn: () => listAssignableRoles(scope),
    enabled: open && !!detail,
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

  const grantableIds = useMemo(() => new Set(grantableData?.grantablePermissionIds ?? []), [grantableData])

  const selectedRole: AssignableRole | undefined = roles?.find(r => r.id === selectedRoleId)
  const inheritedPermIds = useMemo(
    () => new Set((selectedRole?.permissions ?? []).map(p => p.permissionId)),
    [selectedRole],
  )

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

  const effectivePermIds: Set<string> = useMemo(() => {
    const all = new Set(inheritedPermIds)
    overrides.forEach(id => { if (!inheritedPermIds.has(id)) all.add(id) })
    return all
  }, [inheritedPermIds, overrides])

  const effectiveCount = effectivePermIds.size
  const rolePermCount = inheritedPermIds.size
  const overrideCount = effectiveCount - rolePermCount

  const permById = useMemo(() => {
    const m = new Map<string, CatalogPermission>()
    catalog?.forEach(mod => mod.permissions.forEach(p => m.set(p.id, p)))
    return m
  }, [catalog])

  // ── Prefill when detail arrives ────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !detail) return
    setFullName(detail.name === '(no name)' ? '' : detail.name)
    setSelectedRoleId(detail.roleId ?? '')
    setOverrides(new Set(detail.overridePermissionIds ?? []))
    const p = detail.profile
    setAttrs({
      preferredLanguage: detail.preferredLanguage || 'en',
      userType: detail.userType || '',
      isActive: detail.isActive,
      panNumber: '',
      aadhaarLast4: p?.aadhaarLast4 ?? '',
      dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
      gender: p?.gender ?? '',
      addressLine1: p?.addressLine1 ?? '',
      addressLine2: p?.addressLine2 ?? '',
      city: p?.city ?? '',
      state: p?.state ?? '',
      pincode: p?.pincode ?? '',
      country: p?.country || 'IN',
    })
    setPermFilter(''); setShowEffectiveList(false); setErrors({})
  }, [open, detail])

  // Expand all modules when catalog first loads
  useEffect(() => {
    if (open && catalog && expandedModules.size === 0) {
      setExpandedModules(new Set(catalog.map(m => m.module)))
    }
  }, [open, catalog, expandedModules.size])

  const toggleOverride = (permId: string) => {
    if (inheritedPermIds.has(permId)) return
    if (!grantableIds.has(permId)) return
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
      if (allOn) grantableNotInherited.forEach(p => next.delete(p.id))
      else grantableNotInherited.forEach(p => next.add(p.id))
      return next
    })
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!fullName.trim()) errs.fullName = t('users.addUser.err.nameRequired')
    if (!selectedRoleId) errs.role = t('users.addUser.err.roleRequired')
    Object.assign(errs, validateUserAttributes(attrs))
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = useMutation({
    mutationFn: () => updateAdminUser(userId!, {
      fullName: fullName.trim(),
      roleId: selectedRoleId,
      permissionIds: Array.from(overrides),
      preferredLanguage: attrs.preferredLanguage || undefined,
      userType: attrs.userType || undefined,
      isActive: attrs.isActive,
      profile: toProfileInput(attrs),
    }),
    onSuccess: () => {
      toast.success(t('users.editUser.success', { name: fullName.trim() }))
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-user-detail', userId] })
      onClose()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as AdminUserApiErrorCode | undefined
      if (status === 403 && (code === 'Role.PrivilegeEscalation' || code === 'User.PrivilegeEscalation')) {
        toast.error(t('users.addUser.err.escalation'))
      } else if (status === 404) {
        toast.error(t('users.editUser.err.notFound'))
      } else {
        toast.error(t('users.editUser.err.generic'))
      }
    },
  })

  const handleSubmit = () => {
    if (!validate()) return
    mutation.mutate()
  }

  const canSubmit = !!fullName.trim() && !!selectedRoleId && !mutation.isPending && !!detail

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('users.editUser.title')}
      description={t('users.editUser.subtitle')}
      size="xl"
      scrollable
      footer={
        <>
          <Button variant="primary" onClick={handleSubmit} loading={mutation.isPending} disabled={!canSubmit}>
            {t('users.editUser.submit')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      {detailLoading || !detail ? (
        <div className="py-4"><Skeleton variant="list" /></div>
      ) : (
        <div className="space-y-6 py-2">
          {/* ── Read-only identity ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Lock className="h-3.5 w-3.5" /> {t('users.editUser.immutableNote')}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-[var(--text-tertiary)]">{t('users.addUser.email')}</span>
              <span className="text-[var(--text-primary)] truncate">{detail.email ?? '—'}</span>
              <span className="text-[var(--text-tertiary)]">{t('users.addUser.phone')}</span>
              <span className="text-[var(--text-primary)] font-mono">{detail.phone ?? '—'}</span>
              <span className="text-[var(--text-tertiary)]">{t('users.addUser.scope')}</span>
              <span className="text-[var(--text-primary)]">
                {scope === 'platform' ? t('users.addUser.scope.platform') : t('users.addUser.scope.org')}
              </span>
            </div>
          </div>

          {/* ── Full name ───────────────────────────────────────────────────── */}
          <div>
            <label htmlFor="edit-fullName" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('users.addUser.fullName')} <span className="text-rose-500">*</span>
            </label>
            <input
              id="edit-fullName"
              value={fullName}
              onChange={e => { setFullName(e.target.value); setErrors(prev => ({ ...prev, fullName: '' })) }}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                errors.fullName ? 'border-rose-500' : 'border-[var(--border-default)]'
              )}
            />
            {errors.fullName && <p className="mt-1 text-xs text-rose-600">{errors.fullName}</p>}
          </div>

          {/* ── Attributes + KYC ────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('users.attrs.section')}
            </p>
            <UserAttributeFields
              value={attrs}
              onChange={patch => { setAttrs(prev => ({ ...prev, ...patch })); setErrors(prev => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map(k => [k, ''])) })) }}
              panMasked={detail.profile?.panMasked}
              errors={errors}
              enabled={open}
              idPrefix="edit"
            />
          </div>

          {/* ── Role ────────────────────────────────────────────────────────── */}
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
                        name="edit-role"
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
          </div>

          {/* ── Permission overrides ────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('users.addUser.overrides')}
            </p>
            <input
              type="search"
              value={permFilter}
              onChange={e => setPermFilter(e.target.value)}
              placeholder={t('users.addUser.overridesFilter')}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
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

          {/* ── Effective summary ───────────────────────────────────────────── */}
          {selectedRoleId && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 space-y-2">
              <p className="text-sm text-[var(--text-primary)]" aria-live="polite">
                {t('users.addUser.effectiveSummary', { total: effectiveCount, roleCount: rolePermCount, overrideCount })}
              </p>
              {effectiveCount > 0 && (
                <button
                  type="button"
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
      )}
    </Dialog>
  )
}
