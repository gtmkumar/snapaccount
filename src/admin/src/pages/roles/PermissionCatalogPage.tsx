/**
 * PermissionCatalogPage — Auth/RBAC Module 1, Increment 1.1
 *
 * SUPER_ADMIN screen for managing the global permission catalog.
 * Route: /settings/permissions  (gated platform.permissions.manage)
 *
 * i18n: uses @/i18n t() — NOT react-i18next.
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Info, X, Pencil, Ban, CheckCircle2,
  ChevronDown, ChevronRight, Copy, Check, AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { t } from '@/i18n'
import {
  listPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  getPermissionMeta,
  updateResourceType,
  updateActionType,
  type CatalogPermission,
  type PermissionModule,
  type PermissionApiErrorCode,
  type TypeEntry,
} from '@/lib/rbacApi'

// ── Query keys ────────────────────────────────────────────────────────────────
// The catalog management page uses includeInactive=true, so it gets a distinct
// cache entry from the role matrix (which uses the same base key but without the
// param, meaning it only ever sees active permissions).
const CATALOG_MGMT_QUERY_KEY = ['auth', 'permissions', 'catalog', { includeInactive: true }]
// After mutations we also invalidate the matrix's key so new / reactivated perms
// appear in the role matrix immediately.
const MATRIX_CATALOG_MGMT_QUERY_KEY = ['auth', 'permissions', 'catalog']

// ── Permission code name regex (mirrors server-side rule) ──────────────────────
const CODE_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/

// ── Known resource prefixes (seed list for the combobox) ───────────────────────
const KNOWN_RESOURCES = [
  'org', 'gst', 'accounting', 'document', 'chat', 'callback',
  'itr', 'loan', 'platform', 'report', 'subscription',
]

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function PermissionCatalogPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  // Track which modules are expanded
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  // After a create, auto-expand the target module and highlight the new perm
  const [highlightedPermId, setHighlightedPermId] = useState<string | null>(null)

  // includeInactive=true so the catalog shows active + retired and the
  // Active / Inactive filter works. The role-matrix calls listPermissions()
  // WITHOUT this flag so retired permissions vanish there automatically.
  const { data: catalog, isLoading, error } = useQuery({
    queryKey: CATALOG_MGMT_QUERY_KEY,
    queryFn: () => listPermissions(true),
    staleTime: 60_000,
  })

  // Seed expanded modules once catalog loads
  const expandedInitialised = useRef(false)
  if (catalog && !expandedInitialised.current) {
    expandedInitialised.current = true
    setExpandedModules(new Set(catalog.map(m => m.module)))
  }

  const toggleModuleExpand = (mod: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  // Build unique module options for the filter select
  const moduleOptions = catalog?.map(m => ({ value: m.module, label: m.displayName })) ?? []

  // Filter + search the catalog
  const filteredCatalog: PermissionModule[] = (catalog ?? [])
    .filter(m => moduleFilter === 'all' || m.module === moduleFilter)
    .map(m => ({
      ...m,
      permissions: m.permissions.filter(p => {
        if (activeFilter === 'active' && !p.isActive) return false
        if (activeFilter === 'inactive' && p.isActive) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
          (p.description ?? '').toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.resource.toLowerCase().includes(q) ||
          p.action.toLowerCase().includes(q)
        )
      }),
    }))
    .filter(m => m.permissions.length > 0)

  const hasAnyPermission = (catalog ?? []).some(m => m.permissions.length > 0)
  const hasFilteredResults = filteredCatalog.some(m => m.permissions.length > 0)

  const handleCreated = (perm: CatalogPermission) => {
    setShowCreate(false)
    // Auto-expand the new permission's module section
    setExpandedModules(prev => new Set([...prev, perm.resource]))
    setHighlightedPermId(perm.id)
    // Clear highlight after 3 s
    setTimeout(() => setHighlightedPermId(null), 3000)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={t('permissions.catalog.title')}
          subtitle={t('permissions.catalog.subtitle')}
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowTypes(true)}>
            {t('permissions.types.manage')}
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('permissions.create.cta')}
          </Button>
        </div>
      </div>

      {/* Caveat info banner */}
      {!bannerDismissed && (
        <div
          role="status"
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-xl',
            'bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500',
            'text-blue-800 dark:text-blue-200'
          )}
        >
          <Info className="h-5 w-5 shrink-0 mt-0.5 text-blue-500" aria-hidden="true" />
          <p className="flex-1 text-sm">{t('permissions.catalog.caveat')}</p>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
          >
            <X className="h-4 w-4 text-blue-500" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('permissions.catalog.search')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>

        {/* Module filter */}
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
        >
          <option value="all">{t('permissions.catalog.filterModule.all')}</option>
          {moduleOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Active / Inactive segmented control */}
        <div
          role="radiogroup"
          aria-label={t('permissions.catalog.filterActive')}
          className="flex rounded-lg border border-[var(--border-default)] overflow-hidden"
        >
          {(['all', 'active', 'inactive'] as const).map(opt => (
            <button
              key={opt}
              role="radio"
              aria-checked={activeFilter === opt}
              onClick={() => setActiveFilter(opt)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                activeFilter === opt
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
              )}
            >
              {opt === 'all'
                ? t('permissions.catalog.filterAll')
                : opt === 'active'
                  ? t('permissions.catalog.filterActive')
                  : t('permissions.catalog.filterInactive')}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <ErrorBoundary scope="route">
        {isLoading ? (
          <Skeleton variant="list" />
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-secondary)]">{t('permissions.error.generic')}</p>
          </div>
        ) : !hasAnyPermission ? (
          <EmptyState
            variant="generic"
            title={t('permissions.empty.title')}
            description={t('permissions.empty.desc')}
            primaryCta={{ label: t('permissions.create.cta'), onPress: () => setShowCreate(true) }}
          />
        ) : !hasFilteredResults ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {t('permissions.empty.noMatch', { query: search || activeFilter })}
            </p>
            <button
              onClick={() => { setSearch(''); setModuleFilter('all'); setActiveFilter('all') }}
              className="text-sm text-[var(--brand-primary)] hover:underline"
            >
              {t('permissions.empty.clear')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCatalog.map(module => (
              <PermissionModuleSection
                key={module.module}
                module={module}
                isExpanded={expandedModules.has(module.module)}
                onToggleExpand={() => toggleModuleExpand(module.module)}
                highlightedPermId={highlightedPermId}
              />
            ))}
          </div>
        )}
      </ErrorBoundary>

      {/* Create dialog */}
      <CreatePermissionDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        existingResources={catalog?.map(m => m.module) ?? KNOWN_RESOURCES}
      />

      {/* Manage resource/action types (gap #3) */}
      <ManageTypesDialog open={showTypes} onClose={() => setShowTypes(false)} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ManageTypesDialog — rename / (de)activate resource & action types (gap #3)
// ─────────────────────────────────────────────────────────────────────────────

function ManageTypesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: meta } = useQuery({
    queryKey: ['auth', 'permission-meta'],
    queryFn: getPermissionMeta,
    enabled: open,
    staleTime: 60_000,
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['auth', 'permission-meta'] })

  return (
    <Dialog open={open} onClose={onClose} title={t('permissions.types.title')} size="lg"
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}>
      <p className="text-sm text-[var(--text-secondary)] mb-3">{t('permissions.types.subtitle')}</p>
      <div className="grid grid-cols-2 gap-4">
        <TypeColumn title={t('permissions.types.resources')} entries={meta?.resourceTypes ?? []} kind="resource" onSaved={invalidate} />
        <TypeColumn title={t('permissions.types.actions')} entries={meta?.actionTypes ?? []} kind="action" onSaved={invalidate} />
      </div>
    </Dialog>
  )
}

function TypeColumn({
  title, entries, kind, onSaved,
}: {
  title: string
  entries: TypeEntry[]
  kind: 'resource' | 'action'
  onSaved: () => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
        {title} <span className="text-[var(--text-tertiary)]">({entries.length})</span>
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
        {entries.map(e => <TypeRow key={e.id} entry={e} kind={kind} onSaved={onSaved} />)}
      </div>
    </div>
  )
}

function TypeRow({ entry, kind, onSaved }: { entry: TypeEntry; kind: 'resource' | 'action'; onSaved: () => void }) {
  const [name, setName] = useState(entry.name)
  const save = useMutation({
    mutationFn: (params: { name: string; isActive: boolean }) =>
      kind === 'resource'
        ? updateResourceType(entry.id, { name: params.name, description: entry.description ?? null, isActive: params.isActive })
        : updateActionType(entry.id, { name: params.name, description: entry.description ?? null, isActive: params.isActive }),
    onSuccess: () => { toast.success(t('permissions.types.saved')); onSaved() },
    onError: () => toast.error(t('permissions.types.saveError')),
  })

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <code className="text-xs font-mono text-[var(--text-tertiary)] w-28 shrink-0 truncate" title={entry.key}>{entry.key}</code>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={() => { if (name.trim() && name !== entry.name) save.mutate({ name: name.trim(), isActive: true }) }}
        className="flex-1 min-w-0 px-2 py-1 text-sm rounded border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionModuleSection — collapsible group header + rows
// ─────────────────────────────────────────────────────────────────────────────

function PermissionModuleSection({
  module, isExpanded, onToggleExpand, highlightedPermId,
}: {
  module: PermissionModule
  isExpanded: boolean
  onToggleExpand: () => void
  highlightedPermId: string | null
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      {/* Module header */}
      <button
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] transition-colors text-left"
      >
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          : <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        }
        <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
          {module.displayName}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {t('permissions.catalog.moduleCount', { count: module.permissions.length })}
        </span>
      </button>

      {/* Permission rows */}
      {isExpanded && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_200px_64px_80px_80px] items-center gap-2 px-4 py-2 bg-[var(--surface-sunken)]/50">
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('permissions.catalog.col.description')}
            </span>
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('permissions.catalog.col.code')}
            </span>
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide text-center">
              {t('permissions.catalog.col.roles')}
            </span>
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide text-center">
              {t('permissions.catalog.col.active')}
            </span>
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide text-right">
              {t('permissions.catalog.col.actions')}
            </span>
          </div>
          {module.permissions.map(perm => (
            <PermissionRow
              key={perm.id}
              perm={perm}
              highlighted={perm.id === highlightedPermId}
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

function PermissionRow({ perm, highlighted }: { perm: CatalogPermission; highlighted: boolean }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeactivate, setShowDeactivate] = useState(false)
  const isInactive = !perm.isActive

  // Optimistic active toggle
  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => updatePermission(perm.id, { isActive }),
    onMutate: async (isActive) => {
      await queryClient.cancelQueries({ queryKey: CATALOG_MGMT_QUERY_KEY })
      const prev = queryClient.getQueryData(CATALOG_MGMT_QUERY_KEY)
      queryClient.setQueryData(CATALOG_MGMT_QUERY_KEY, (old: PermissionModule[] | undefined) =>
        old?.map(m => ({
          ...m,
          permissions: m.permissions.map(p =>
            p.id === perm.id ? { ...p, isActive } : p
          ),
        }))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(CATALOG_MGMT_QUERY_KEY, ctx.prev)
      toast.error(t('permissions.error.generic'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CATALOG_MGMT_QUERY_KEY })
      // Re-sync the matrix: retiring a perm should make it vanish from the matrix.
      void queryClient.invalidateQueries({ queryKey: MATRIX_CATALOG_MGMT_QUERY_KEY })
    },
  })

  const handleCopy = () => {
    void navigator.clipboard.writeText(perm.name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className={cn(
      'grid grid-cols-[1fr_200px_64px_80px_80px] items-center gap-2 px-4 py-2.5 bg-[var(--surface-raised)] transition-colors',
      highlighted && 'bg-blue-50/50 dark:bg-blue-950/30',
    )}>
      {/* Description */}
      <span className={cn('text-sm', isInactive ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]')}>
        {perm.description ?? perm.name}
      </span>

      {/* Code — copy on click */}
      <div>
        <button
          onClick={handleCopy}
          title={copied ? t('permissions.catalog.codeCopied') : t('common.copy')}
          aria-label={`${t('common.copy')}: ${perm.name}`}
          className="flex items-center gap-1.5 group"
        >
          <code className={cn(
            'text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)]',
            isInactive ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-tertiary)]'
          )}>
            {perm.name}
          </code>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            {copied
              ? <Check className="h-3 w-3 text-emerald-500" />
              : <Copy className="h-3 w-3 text-[var(--text-tertiary)]" />}
          </span>
        </button>
        {/* Copied announcement for screen readers */}
        <span aria-live="polite" className="sr-only">{copied ? t('permissions.catalog.codeCopied') : ''}</span>
      </div>

      {/* # roles — real value from API, no client-side default */}
      <span className={cn(
        'text-sm text-center tabular-nums',
        perm.roleCount === 0 ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'
      )}>
        {perm.roleCount}
      </span>

      {/* Active toggle — real value from API */}
      <div className="flex justify-center">
        <Toggle
          checked={perm.isActive}
          onChange={checked => toggleMutation.mutate(checked)}
          loading={toggleMutation.isPending}
          size="sm"
          id={`perm-active-${perm.id}`}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEdit(true)}
          aria-label={`${t('permissions.edit.title')}: ${perm.name}`}
        >
          <Pencil className="h-4 w-4 text-[var(--text-secondary)]" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeactivate(true)}
          aria-label={`${t('permissions.deactivate.cta')}: ${perm.name}`}
        >
          <Ban className="h-4 w-4 text-rose-500" />
        </Button>
      </div>

      {/* Edit dialog */}
      <EditPermissionDialog
        open={showEdit}
        perm={perm}
        onClose={() => setShowEdit(false)}
      />

      {/* Deactivate confirm dialog */}
      <DeactivateDialog
        open={showDeactivate}
        perm={perm}
        onClose={() => setShowDeactivate(false)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreatePermissionDialog
// ─────────────────────────────────────────────────────────────────────────────

function CreatePermissionDialog({
  open, onClose, onCreated, existingResources,
}: {
  open: boolean
  onClose: () => void
  onCreated: (perm: CatalogPermission) => void
  existingResources: string[]
}) {
  const queryClient = useQueryClient()
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')
  const [description, setDescription] = useState('')
  const [duplicateError, setDuplicateError] = useState(false)
  const [resourceOpen, setResourceOpen] = useState(false)
  const [actionOpen, setActionOpen] = useState(false)

  // Gap #3: resource + action options come from the configurable catalogs.
  const { data: meta } = useQuery({
    queryKey: ['auth', 'permission-meta'],
    queryFn: getPermissionMeta,
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const resourceKeys = (meta?.resourceTypes ?? []).map(r => r.key)
  const actionKeys = (meta?.actionTypes ?? []).map(a => a.key)
  const isNewResource = resource.length > 0 && !resourceKeys.includes(resource)
  const isNewAction = action.length > 0 && !actionKeys.includes(action)

  const code = resource && action ? `${resource}.${action}` : ''
  const isValidCode = CODE_REGEX.test(code)

  const reset = () => {
    setResource(''); setAction(''); setDescription(''); setDuplicateError(false)
  }

  const handleClose = () => { reset(); onClose() }

  const mutation = useMutation({
    mutationFn: () => createPermission({ name: code, description: description || undefined }),
    onSuccess: (perm) => {
      toast.success(t('permissions.create.success', { code }))
      void queryClient.invalidateQueries({ queryKey: CATALOG_MGMT_QUERY_KEY })
      // Also invalidate the matrix's cache so the new perm appears in the role matrix.
      void queryClient.invalidateQueries({ queryKey: MATRIX_CATALOG_MGMT_QUERY_KEY })
      reset()
      onCreated(perm)
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response?.status
      const code_ = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as PermissionApiErrorCode | undefined
      if (status === 409 && code_ === 'Permission.Duplicate') {
        setDuplicateError(true)
      } else if (status === 400) {
        // server also validated format — show as invalid (should not normally reach here)
        setDuplicateError(false)
      } else if (status === 403) {
        toast.error(t('permissions.error.forbidden'))
      } else {
        toast.error(t('permissions.error.generic'))
      }
    },
  })

  const canSubmit = isValidCode && description.trim().length > 0 && !mutation.isPending

  // Resource options: prefer the live resource-type catalog (gap #3), falling back
  // to the seed + existing resources before meta loads.
  const allResources = Array.from(new Set([
    ...resourceKeys, ...KNOWN_RESOURCES, ...existingResources,
  ])).sort()
  const filteredResources = allResources.filter(r => r.startsWith(resource.toLowerCase()))
  const filteredActions = actionKeys.filter(a => a.startsWith(action.toLowerCase())).sort().slice(0, 50)

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t('permissions.create.title')}
      size="md"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSubmit}
          >
            {t('permissions.create.submit')}
          </Button>
          <Button variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        {/* Resource + Action row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Resource combobox */}
          <div className="relative">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('permissions.create.resource')} <span className="text-rose-500">*</span>
            </label>
            <input
              value={resource}
              onChange={e => { setResource(e.target.value.toLowerCase()); setDuplicateError(false); setResourceOpen(true) }}
              onFocus={() => setResourceOpen(true)}
              onBlur={() => setTimeout(() => setResourceOpen(false), 150)}
              placeholder="gst"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {isNewResource
                ? t('permissions.create.newResourceType')
                : t('permissions.create.resourceHint')}
            </p>
            {/* Dropdown */}
            {resourceOpen && filteredResources.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] max-h-40 overflow-y-auto">
                {filteredResources.map(r => (
                  <button
                    key={r}
                    onMouseDown={() => { setResource(r); setResourceOpen(false); setDuplicateError(false) }}
                    className="w-full text-left px-3 py-1.5 text-sm font-mono text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action combobox (sourced from the action-type catalog) */}
          <div className="relative">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('permissions.create.action')} <span className="text-rose-500">*</span>
            </label>
            <input
              value={action}
              onChange={e => { setAction(e.target.value.toLowerCase()); setDuplicateError(false); setActionOpen(true) }}
              onFocus={() => setActionOpen(true)}
              onBlur={() => setTimeout(() => setActionOpen(false), 150)}
              placeholder="returns.file"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {isNewAction
                ? t('permissions.create.newActionType')
                : t('permissions.create.actionHint')}
            </p>
            {actionOpen && filteredActions.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] max-h-40 overflow-y-auto">
                {filteredActions.map(a => (
                  <button
                    key={a}
                    onMouseDown={() => { setAction(a); setActionOpen(false); setDuplicateError(false) }}
                    className="w-full text-left px-3 py-1.5 text-sm font-mono text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live code preview */}
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
            {t('permissions.create.codePreview')}
          </p>
          <div
            aria-live="polite"
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-sm',
              !code
                ? 'border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]'
                : isValidCode && !duplicateError
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-400 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
            )}
          >
            <span className="flex-1">{code || 'resource.action'}</span>
            {code && isValidCode && !duplicateError && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-label={t('permissions.create.valid')} />
            )}
          </div>
          {/* Validation messages */}
          {code && !isValidCode && (
            <p className="mt-1 text-xs text-rose-600">{t('permissions.create.invalidFormat')}</p>
          )}
          {duplicateError && (
            <p className="mt-1 text-xs text-rose-600">{t('permissions.create.duplicate')}</p>
          )}
          {code && isValidCode && !duplicateError && (
            <p className="mt-1 text-xs text-emerald-600">{t('permissions.create.valid')}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('permissions.create.description')} <span className="text-rose-500">*</span>
          </label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="File GST returns on behalf of a client"
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>

        {/* Caveat short */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" aria-hidden="true" />
          <p className="text-xs">{t('permissions.catalog.caveatShort')}</p>
        </div>
      </div>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EditPermissionDialog
// ─────────────────────────────────────────────────────────────────────────────

function EditPermissionDialog({
  open, perm, onClose,
}: {
  open: boolean
  perm: CatalogPermission
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [description, setDescription] = useState(perm.description ?? '')
  const [isActive, setIsActive] = useState(perm.isActive)

  // Reset when perm changes
  const lastPermId = useRef(perm.id)
  if (lastPermId.current !== perm.id) {
    lastPermId.current = perm.id
    setDescription(perm.description ?? '')
    setIsActive(perm.isActive)
  }

  const mutation = useMutation({
    mutationFn: () => updatePermission(perm.id, {
      description: description || undefined,
      isActive,
    }),
    onSuccess: () => {
      toast.success(t('permissions.edit.success'))
      void queryClient.invalidateQueries({ queryKey: CATALOG_MGMT_QUERY_KEY })
      // Retiring a permission via edit should also update the matrix.
      void queryClient.invalidateQueries({ queryKey: MATRIX_CATALOG_MGMT_QUERY_KEY })
      onClose()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) toast.error(t('permissions.error.forbidden'))
      else toast.error(t('permissions.error.generic'))
    },
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('permissions.edit.title')}
      size="md"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={mutation.isPending}
          >
            {t('permissions.edit.submit')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        {/* Code — read-only */}
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
            {t('permissions.catalog.col.code')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] font-mono text-sm text-[var(--text-secondary)]">
              {perm.name}
            </code>
          </div>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('permissions.edit.codeImmutable')}</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('permissions.edit.description')}
          </label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>

        {/* Active toggle */}
        <Toggle
          checked={isActive}
          onChange={setIsActive}
          label={t('permissions.edit.active')}
          size="md"
        />
      </div>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DeactivateDialog
// ─────────────────────────────────────────────────────────────────────────────

function DeactivateDialog({
  open, perm, onClose,
}: {
  open: boolean
  perm: CatalogPermission
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const roleCount = perm.roleCount
  const hasRoles = roleCount > 0

  const mutation = useMutation({
    mutationFn: () => deletePermission(perm.id),
    onSuccess: () => {
      toast.success(t('permissions.deactivate.success'))
      void queryClient.invalidateQueries({ queryKey: CATALOG_MGMT_QUERY_KEY })
      // Deactivated permissions must vanish from the role matrix immediately.
      void queryClient.invalidateQueries({ queryKey: MATRIX_CATALOG_MGMT_QUERY_KEY })
      onClose()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { code?: string; count?: number } } })?.response?.status
      const errCode = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as PermissionApiErrorCode | undefined
      const count = (err as { response?: { data?: { count?: number } } })?.response?.data?.count ?? roleCount

      if (status === 409 && errCode === 'Permission.InUse') {
        // Server blocked — hard block (not just a warning)
        toast.error(t('permissions.deactivate.blocked', { code: perm.name, count }))
      } else if (status === 403) {
        toast.error(t('permissions.error.forbidden'))
      } else {
        toast.error(t('permissions.error.generic'))
      }
      onClose()
    },
  })

  const bodyText = hasRoles
    ? t('permissions.deactivate.warnReferenced', { code: perm.name, count: roleCount })
    : t('permissions.deactivate.confirm', { code: perm.name })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('permissions.deactivate.cta')}
      size="sm"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            className={hasRoles ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}
          >
            {t('permissions.deactivate.cta')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
        {hasRoles && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-amber-800 dark:text-amber-200">{bodyText}</p>
          </div>
        )}
        {!hasRoles && (
          <p className="text-sm text-[var(--text-secondary)]">{bodyText}</p>
        )}
      </div>
    </Dialog>
  )
}
