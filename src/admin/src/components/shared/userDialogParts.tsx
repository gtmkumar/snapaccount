/**
 * userDialogParts — shared building blocks for AddUserDialog + EditUserDialog
 * (Auth/RBAC Module 1). Extracted in Increment 1.4 Phase B so the Edit dialog
 * reuses the exact override matrix UI rather than duplicating it.
 *
 * i18n: @/i18n t() (NOT react-i18next).
 */
import { ChevronDown, ChevronRight, Check, Lock } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { PermissionModule, CatalogPermission } from '@/lib/rbacApi'

// ── Password strength (Add dialog, DEV initial password) ────────────────────

export function getPasswordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' }
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return { score: s as 0 | 1 | 2 | 3 | 4, label: labels[s] }
}

export const PWD_COLORS = ['', 'bg-rose-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500']

// ── Override matrix ─────────────────────────────────────────────────────────

export function OverrideModuleSection({
  module, isExpanded, onToggleExpand,
  overrides, inheritedPermIds, grantableIds,
  onToggle, onSelectAll,
}: {
  module: PermissionModule
  isExpanded: boolean
  onToggleExpand: () => void
  overrides: Set<string>
  inheritedPermIds: Set<string>
  grantableIds: Set<string>
  onToggle: (permId: string) => void
  onSelectAll: () => void
}) {
  const grantableNotInherited = module.permissions.filter(
    p => grantableIds.has(p.id) && !inheritedPermIds.has(p.id)
  )
  const anyGrantable = grantableNotInherited.length > 0
  const allSelected = anyGrantable && grantableNotInherited.every(p => overrides.has(p.id))

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] transition-colors text-left"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" /> : <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />}
        <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{module.displayName}</span>
        {anyGrantable && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSelectAll() }}
            className="text-xs text-[var(--brand-primary)] hover:underline px-1"
            title={t('users.addUser.selectAllGrantable')}
          >
            {allSelected ? 'Deselect all' : t('users.addUser.selectAllGrantable')}
          </button>
        )}
      </button>

      {isExpanded && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {module.permissions.map(perm => (
            <OverridePermissionRow
              key={perm.id}
              perm={perm}
              isInherited={inheritedPermIds.has(perm.id)}
              isGrantable={grantableIds.has(perm.id)}
              isOverrideOn={overrides.has(perm.id)}
              onToggle={() => onToggle(perm.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OverridePermissionRow({
  perm, isInherited, isGrantable, isOverrideOn, onToggle,
}: {
  perm: CatalogPermission
  isInherited: boolean
  isGrantable: boolean
  isOverrideOn: boolean
  onToggle: () => void
}) {
  const isDisabled = isInherited || !isGrantable
  const checked = isInherited || isOverrideOn

  const tooltipText = isInherited
    ? t('users.addUser.alreadyInherited')
    : !isGrantable
      ? t('users.addUser.notGrantable')
      : undefined

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-2.5 bg-[var(--surface-raised)]',
      (isDisabled && !isInherited) && 'opacity-60'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-sm', isDisabled ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]')}>
            {perm.description ?? perm.name}
          </span>
          {isInherited && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              inherited
            </span>
          )}
          {!isGrantable && !isInherited && (
            <span title={tooltipText} className="inline-flex items-center">
              <Lock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
            </span>
          )}
        </div>
        <code className="text-xs text-[var(--text-tertiary)] font-mono">{perm.resource}.{perm.action}</code>
      </div>

      <div title={tooltipText}>
        <Toggle
          checked={checked}
          onChange={isDisabled ? () => undefined : onToggle}
          disabled={isDisabled}
          size="sm"
          id={`override-${perm.id}`}
        />
      </div>
    </div>
  )
}
