/**
 * RolesPermissionsPage — Auth/RBAC Module 1
 *
 * Two-pane Role & Permission matrix.
 * Left rail: role list with search + "Create role" button.
 * Right pane: per-module collapsible permission sections with row toggles.
 *
 * Delegation rule: toggles NOT in /auth/me/grantable-permissions are
 * disabled/greyed with a Lock icon + tooltip. Never hides existing grants.
 *
 * Route: /settings/roles  (gated org.roles.read)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import { Search, Plus, Lock, ChevronDown, ChevronRight, Shield, MoreHorizontal, Save, X, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Dialog } from '@/components/ui/Dialog'
import { RoleChip } from '@/components/ui/RoleChip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  listOrgRoles, getRolePermissions, setRolePermissions,
  listPermissions, getGrantablePermissions,
  createOrgRole, deleteOrgRole,
  type OrgRoleSummary, type PermissionModule, type CatalogPermission,
} from '@/lib/rbacApi'
import type { AdminRole } from '@/hooks/useAuth'

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function RolesPermissionsPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleSearch, setRoleSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['org', 'roles'],
    queryFn: listOrgRoles,
    staleTime: 60_000,
  })

  // No includeInactive param — the matrix only shows active permissions.
  // Retired permissions vanish from the matrix automatically (server default).
  const { data: permCatalog, isLoading: catalogLoading } = useQuery({
    queryKey: ['auth', 'permissions', 'catalog'],
    queryFn: () => listPermissions(),
    staleTime: 5 * 60_000,
  })

  const { data: grantableData } = useQuery({
    queryKey: ['auth', 'me', 'grantable-permissions'],
    queryFn: getGrantablePermissions,
    staleTime: 5 * 60_000,
  })

  const grantableIds = new Set(grantableData?.grantablePermissionIds ?? [])

  const filteredRoles = (roles ?? []).filter(r =>
    r.displayName.toLowerCase().includes(roleSearch.toLowerCase()) ||
    r.name.toLowerCase().includes(roleSearch.toLowerCase())
  )

  const selectedRole = roles?.find(r => r.id === selectedRoleId) ?? null

  // Auto-select first role when list loads
  useEffect(() => {
    if (!selectedRoleId && roles?.length) {
      setSelectedRoleId(roles[0].id)
    }
  }, [roles, selectedRoleId])

  const handleRoleCreated = (roleId: string) => {
    setShowCreateDialog(false)
    setSelectedRoleId(roleId)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
      />

      <div className="flex flex-1 gap-0 mt-6 min-h-0">
        {/* ── Left rail ─────────────────────────────────────────────────────── */}
        <ErrorBoundary scope="pane">
          <aside className="w-72 shrink-0 flex flex-col border-r border-[var(--border-subtle)] pr-4 mr-4">
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
                placeholder={t('roles.searchRoles')}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
              />
            </div>

            {/* Create role button */}
            <Button
              variant="primary"
              size="sm"
              className="mb-4 w-full justify-center"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('roles.createRole')}
            </Button>

            {/* Role list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {rolesLoading ? (
                <Skeleton variant="list" />
              ) : filteredRoles.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                  {roleSearch
                    ? t('roles.noSearchResults', { q: roleSearch })
                    : t('roles.noRoles')}
                </p>
              ) : (
                filteredRoles.map(role => (
                  <RoleListItem
                    key={role.id}
                    role={role}
                    selected={selectedRoleId === role.id}
                    onSelect={() => setSelectedRoleId(role.id)}
                  />
                ))
              )}
            </div>
          </aside>
        </ErrorBoundary>

        {/* ── Right pane ────────────────────────────────────────────────────── */}
        <ErrorBoundary scope="pane">
          <div className="flex-1 min-w-0 flex flex-col">
            {!selectedRole ? (
              <EmptyState
                variant="team"
                title={t('roles.selectRole')}
                description={t('roles.selectRoleHint')}
              />
            ) : catalogLoading ? (
              <MatrixSkeleton />
            ) : (
              <PermissionMatrix
                role={selectedRole}
                catalog={permCatalog ?? []}
                grantableIds={grantableIds}
              />
            )}
          </div>
        </ErrorBoundary>
      </div>

      {/* Create role dialog */}
      <CreateRoleDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleRoleCreated}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RoleListItem
// ─────────────────────────────────────────────────────────────────────────────

function RoleListItem({
  role, selected, onSelect,
}: {
  role: OrgRoleSummary
  selected: boolean
  onSelect: () => void
}) {

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors group',
        selected
          ? 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/30'
          : 'hover:bg-[var(--surface-sunken)] border border-transparent'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Shield className={cn('h-4 w-4 shrink-0', selected ? 'text-[var(--brand-primary)]' : 'text-[var(--text-tertiary)]')} />
        <span className={cn('text-sm font-medium truncate', selected ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]')}>
          {role.displayName}
        </span>
        {role.isSystemRole && (
          <span className="ml-auto shrink-0 text-xs px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
            {t('roles.system')}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-tertiary)] pl-6">
        {t('roles.memberCount', { count: role.memberCount })}
      </p>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionMatrix — the right pane with dirty state management
// ─────────────────────────────────────────────────────────────────────────────

function PermissionMatrix({
  role, catalog, grantableIds,
}: {
  role: OrgRoleSummary
  catalog: PermissionModule[]
  grantableIds: Set<string>
}) {
  const queryClient = useQueryClient()

  // Load the role's current permission grants
  const { data: rolePerms, isLoading: rolePermsLoading } = useQuery({
    queryKey: ['org', 'roles', role.id, 'permissions'],
    queryFn: () => getRolePermissions(role.id),
    staleTime: 30_000,
  })

  // Draft state: set of granted permission IDs
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [isDirty, setIsDirty] = useState(false)
  const serverSnapshot = useRef<Set<string>>(new Set())

  // Permission filter
  const [permFilter, setPermFilter] = useState('')

  // Module expand state
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  // Reset draft when role changes or data loads
  useEffect(() => {
    if (rolePerms) {
      const granted = new Set(rolePerms.permissions.map(p => p.permissionId))
      serverSnapshot.current = new Set(granted)
      setDraft(new Set(granted))
      setIsDirty(false)
      // Expand all modules by default when first loading
      setExpandedModules(new Set(catalog.map(m => m.module)))
    }
  }, [rolePerms, role.id, catalog])

  const togglePermission = useCallback((permId: string) => {
    setDraft(prev => {
      const next = new Set(prev)
      if (next.has(permId)) {
        next.delete(permId)
      } else {
        next.add(permId)
      }
      return next
    })
    setIsDirty(true)
  }, [])

  const toggleModule = useCallback((module: PermissionModule) => {
    const grantableInModule = module.permissions.filter(p => grantableIds.has(p.id))
    const allGranted = grantableInModule.every(p => draft.has(p.id))

    setDraft(prev => {
      const next = new Set(prev)
      if (allGranted) {
        // Remove only grantable ones from this module
        grantableInModule.forEach(p => next.delete(p.id))
      } else {
        // Add all grantable ones
        grantableInModule.forEach(p => next.add(p.id))
      }
      return next
    })
    setIsDirty(true)
  }, [draft, grantableIds])

  const toggleModuleExpand = (moduleName: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleName)) next.delete(moduleName)
      else next.add(moduleName)
      return next
    })
  }

  const expandAll = () => setExpandedModules(new Set(catalog.map(m => m.module)))
  const collapseAll = () => setExpandedModules(new Set())

  const discard = () => {
    setDraft(new Set(serverSnapshot.current))
    setIsDirty(false)
  }

  const saveMutation = useMutation({
    mutationFn: () => setRolePermissions(role.id, Array.from(draft)),
    onSuccess: () => {
      serverSnapshot.current = new Set(draft)
      setIsDirty(false)
      toast.success(t('roles.matrix.saved'))
      void queryClient.invalidateQueries({ queryKey: ['org', 'roles', role.id, 'permissions'] })
      void queryClient.invalidateQueries({ queryKey: ['org', 'roles'] })
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        // Revert draft to server snapshot on escalation rejection
        setDraft(new Set(serverSnapshot.current))
        setIsDirty(false)
        toast.error(t('roles.matrix.escalationRejected'))
      } else {
        toast.error(t('roles.matrix.saveError'))
      }
    },
  })

  // Cmd/Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isDirty) {
        e.preventDefault()
        saveMutation.mutate()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDirty, saveMutation])

  // System role banner
  const isReadOnly = role.isSystemRole

  // Filter catalog
  const filteredCatalog = catalog.map(module => ({
    ...module,
    permissions: module.permissions.filter(p =>
      !permFilter ||
      p.name.toLowerCase().includes(permFilter.toLowerCase()) ||
      p.description?.toLowerCase().includes(permFilter.toLowerCase()) ||
      (p.resource + '.' + p.action).toLowerCase().includes(permFilter.toLowerCase())
    ),
  })).filter(module => module.permissions.length > 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Role header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--border-subtle)]">
        <RoleChip role={role.name as AdminRole} size="md" />
        {role.isSystemRole && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            {t('roles.systemRole')}
          </span>
        )}
        <span className="text-sm text-[var(--text-tertiary)]">
          {t('roles.memberCount', { count: role.memberCount })}
        </span>
        {!isReadOnly && (
          <div className="ml-auto">
            <RoleActionMenu role={role} />
          </div>
        )}
      </div>

      {/* System role read-only banner */}
      {isReadOnly && (
        <div className="flex items-start gap-3 p-4 mb-4 rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
          <Shield className="h-5 w-5 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t('roles.matrix.systemReadOnlyTitle')}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {t('roles.matrix.systemReadOnly')}
            </p>
          </div>
        </div>
      )}

      {/* Permission filter + expand/collapse */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={permFilter}
            onChange={e => setPermFilter(e.target.value)}
            placeholder={t('roles.filterPerms')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>
        <button
          onClick={expandAll}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded"
        >
          {t('roles.expandAll')}
        </button>
        <button
          onClick={collapseAll}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded"
        >
          {t('roles.collapseAll')}
        </button>
      </div>

      {/* Permission modules */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-20">
        {rolePermsLoading ? (
          <MatrixSkeleton />
        ) : filteredCatalog.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-secondary)]">
              {t('roles.noPermMatches', { q: permFilter })}
            </p>
            {permFilter && (
              <button
                onClick={() => setPermFilter('')}
                className="mt-2 text-sm text-[var(--brand-primary)] hover:underline"
              >
                {t('common.clearFilter')}
              </button>
            )}
          </div>
        ) : (
          filteredCatalog.map(module => {
            const grantableInModule = module.permissions.filter(p => grantableIds.has(p.id))
            const grantedCount = module.permissions.filter(p => draft.has(p.id)).length
            const isExpanded = expandedModules.has(module.module)
            const allGrantable = grantableInModule.every(p => draft.has(p.id))
            const hasNoGrantable = grantableInModule.length === 0

            return (
              <PermissionModuleSection
                key={module.module}
                module={module}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleModuleExpand(module.module)}
                grantedCount={grantedCount}
                totalCount={module.permissions.length}
                grantableIds={grantableIds}
                draft={draft}
                onTogglePerm={isReadOnly ? undefined : togglePermission}
                onSelectAll={isReadOnly || hasNoGrantable ? undefined : () => toggleModule(module)}
                allGrantableSelected={allGrantable}
                hasNoGrantable={hasNoGrantable}
              />
            )
          })
        )}
      </div>

      {/* Dirty save bar */}
      {isDirty && !isReadOnly && (
        <DirtySaveBar
          draft={draft}
          snapshot={serverSnapshot.current}
          onDiscard={discard}
          onSave={() => saveMutation.mutate()}
          saving={saveMutation.isPending}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionModuleSection
// ─────────────────────────────────────────────────────────────────────────────

function PermissionModuleSection({
  module, isExpanded, onToggleExpand,
  grantedCount, totalCount,
  grantableIds, draft,
  onTogglePerm, onSelectAll, allGrantableSelected, hasNoGrantable,
}: {
  module: PermissionModule
  isExpanded: boolean
  onToggleExpand: () => void
  grantedCount: number
  totalCount: number
  grantableIds: Set<string>
  draft: Set<string>
  onTogglePerm?: (permId: string) => void
  onSelectAll?: () => void
  allGrantableSelected: boolean
  hasNoGrantable: boolean
}) {

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      {/* Module header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] transition-colors text-left"
        aria-expanded={isExpanded}
      >
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          : <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        }
        <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
          {module.displayName}
        </span>
        <span className="text-xs text-[var(--text-tertiary)] mr-2">
          {t('roles.grantedOf', { granted: grantedCount, total: totalCount })}
        </span>
        {onSelectAll && (
          <button
            onClick={e => { e.stopPropagation(); onSelectAll() }}
            disabled={hasNoGrantable}
            title={hasNoGrantable
              ? t('roles.matrix.noGrantableInModule')
              : t('roles.matrix.selectAllGrantableOnly')
            }
            className={cn(
              'text-xs px-2 py-0.5 rounded-full border transition-colors',
              hasNoGrantable
                ? 'border-[var(--border-subtle)] text-[var(--text-tertiary)] cursor-not-allowed opacity-60'
                : allGrantableSelected
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
            )}
          >
            {allGrantableSelected
              ? t('roles.deselectAll')
              : t('roles.selectAll')}
          </button>
        )}
      </button>

      {/* Permission rows */}
      {isExpanded && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {module.permissions.map(perm => (
            <PermissionRow
              key={perm.id}
              perm={perm}
              isGranted={draft.has(perm.id)}
              isGrantable={grantableIds.has(perm.id)}
              onToggle={onTogglePerm ? () => onTogglePerm(perm.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionRow
// ─────────────────────────────────────────────────────────────────────────────

function PermissionRow({
  perm, isGranted, isGrantable, onToggle,
}: {
  perm: CatalogPermission
  isGranted: boolean
  isGrantable: boolean
  onToggle?: () => void
}) {
  const isReadOnly = !onToggle
  const isDisabled = isReadOnly || !isGrantable

  const tooltipText = !isGrantable
    ? t('roles.matrix.notGrantable', { permission: perm.name })
    : undefined

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-3 bg-[var(--surface-raised)]',
      isDisabled && !isGranted && 'opacity-60'
    )}>
      {/* Label + perm key */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-sm font-medium', isDisabled ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]')}>
            {perm.description ?? perm.name}
          </span>
          {!isGrantable && onToggle !== undefined && (
            <span title={tooltipText} className="inline-flex items-center">
              <Lock className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
            </span>
          )}
        </div>
        <code className="text-xs text-[var(--text-tertiary)] font-mono">
          {perm.resource}.{perm.action}
        </code>
      </div>

      {/* Toggle */}
      <div title={tooltipText}>
        <Toggle
          checked={isGranted}
          onChange={isDisabled ? () => undefined : () => onToggle?.()}
          disabled={isDisabled}
          size="sm"
          id={`perm-toggle-${perm.id}`}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DirtySaveBar
// ─────────────────────────────────────────────────────────────────────────────

function DirtySaveBar({
  draft, snapshot, onDiscard, onSave, saving,
}: {
  draft: Set<string>
  snapshot: Set<string>
  onDiscard: () => void
  onSave: () => void
  saving: boolean
}) {

  // Count added and removed
  let added = 0
  let removed = 0
  draft.forEach(id => { if (!snapshot.has(id)) added++ })
  snapshot.forEach(id => { if (!draft.has(id)) removed++ })
  const total = added + removed

  return (
    <div
      className={cn(
        'absolute bottom-0 left-0 right-0',
        'flex items-center gap-3 px-4 py-3',
        'bg-[var(--surface-raised)] border-t border-[var(--border-subtle)]',
        'shadow-[var(--shadow-md)]',
        'rounded-b-xl'
      )}
      role="status"
      aria-live="polite"
    >
      <span className="flex-1 text-sm text-[var(--text-primary)]">
        {t('roles.matrix.unsavedChanges', { count: total })}
        {added > 0 && removed > 0 && (
          <span className="text-[var(--text-tertiary)] ml-1">
            ({t('roles.matrix.changesDetail', { added, removed })})
          </span>
        )}
      </span>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
        <X className="h-4 w-4 mr-1" />
        {t('roles.matrix.discard')}
      </Button>
      <Button variant="primary" size="sm" onClick={onSave} loading={saving}>
        <Save className="h-4 w-4 mr-1" />
        {t('roles.matrix.saveChanges')}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateRoleDialog
// ─────────────────────────────────────────────────────────────────────────────

function CreateRoleDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (roleId: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')

  const mutation = useMutation({
    mutationFn: () => createOrgRole({ name, displayName, description: description || undefined }),
    onSuccess: data => {
      toast.success(t('roles.created', { name: displayName }))
      void queryClient.invalidateQueries({ queryKey: ['org', 'roles'] })
      onCreated(data.roleId)
      setName('')
      setDisplayName('')
      setDescription('')
    },
    onError: () => toast.error(t('roles.createError')),
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('roles.createRoleTitle')}
      description={t('roles.createRoleDesc')}
      size="md"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!name.trim() || !displayName.trim()}
          >
            {t('roles.create')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('roles.field.name')} <span className="text-[var(--error-500)]">*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            placeholder="hr_manager"
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('roles.field.nameHint')}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('roles.field.displayName')} <span className="text-[var(--error-500)]">*</span>
          </label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="HR Manager"
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('roles.field.description')}
            <span className="text-[var(--text-tertiary)] ml-1 font-normal">{t('common.optional')}</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={140}
            rows={2}
            placeholder={t('roles.field.descriptionPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
          <p className="text-xs text-right text-[var(--text-tertiary)]">{description.length}/140</p>
        </div>
      </div>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RoleActionMenu
// ─────────────────────────────────────────────────────────────────────────────

function RoleActionMenu({ role }: { role: OrgRoleSummary }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrgRole(role.id),
    onSuccess: () => {
      toast.success(t('roles.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['org', 'roles'] })
      setShowDeleteConfirm(false)
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        toast.error(t('roles.deleteError.members'))
      } else {
        toast.error(t('roles.deleteError.generic'))
      }
      setShowDeleteConfirm(false)
    },
  })

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} aria-label={t('common.moreActions')}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] overflow-hidden">
            <button
              onClick={() => { setOpen(false); setShowDeleteConfirm(true) }}
              className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
            >
              {t('roles.delete')}
            </button>
          </div>
        </>
      )}

      {/* Delete confirm */}
      <Dialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('roles.deleteConfirmTitle')}
        description={t('roles.deleteConfirmDesc')}
        size="sm"
        footer={
          <>
            <Button
              variant="primary"
              onClick={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              {t('roles.deleteConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MatrixSkeleton
// ─────────────────────────────────────────────────────────────────────────────

function MatrixSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
          <div className="h-10 bg-[var(--surface-sunken)]" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {[1, 2, 3].map(j => (
              <div key={j} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-40 bg-[var(--surface-sunken)] rounded" />
                  <div className="h-3 w-24 bg-[var(--surface-sunken)] rounded" />
                </div>
                <div className="h-5 w-9 bg-[var(--surface-sunken)] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

