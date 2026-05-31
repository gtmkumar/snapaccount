/**
 * NavigationManagementPage — Menu Management (closes the navigation module).
 * Route: /settings/navigation (SUPER_ADMIN, platform.permissions.manage).
 *
 * CRUD over the data-driven sidebar (auth.navigation_item + auth.menu_permission):
 * add/edit/reorder/(de)activate menu items, set icon/url/parent, and pick the
 * permission(s) that reveal each item. The sidebar reflects changes on next load.
 *
 * i18n: react-i18next useTranslation with inline string defaults (no {{}} interp).
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Search, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Toggle } from '@/components/ui/Toggle'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { navIcon, NAV_ICON_KEYS } from '@/components/layout/navIcons'
import {
  listNavigationAdmin, createNavigationItem, updateNavigationItem, deleteNavigationItem,
  type NavigationItemAdmin,
} from '@/lib/menuApi'
import { listPermissions } from '@/lib/rbacApi'
import { cn } from '@/lib/utils'

export default function NavigationManagementPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<NavigationItemAdmin | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<NavigationItemAdmin | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['nav', 'admin'],
    queryFn: listNavigationAdmin,
    staleTime: 30_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['nav', 'admin'] })
    void queryClient.invalidateQueries({ queryKey: ['nav', 'menu'] }) // refresh the live sidebar
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNavigationItem(id),
    onSuccess: () => {
      toast.success(t('nav.mgmt.deleted', 'Menu item deleted'))
      setDeleteTarget(null)
      invalidate()
    },
    onError: () => { toast.error(t('nav.mgmt.deleteError', 'Failed to delete menu item')); setDeleteTarget(null) },
  })

  // Order: top-level by displayOrder, each followed by its children.
  const ordered = useMemo(() => {
    const top = items.filter(i => !i.parentId).sort((a, b) => a.displayOrder - b.displayOrder)
    const childrenOf = (id: string) => items.filter(i => i.parentId === id).sort((a, b) => a.displayOrder - b.displayOrder)
    const rows: { item: NavigationItemAdmin; depth: number }[] = []
    for (const p of top) {
      rows.push({ item: p, depth: 0 })
      for (const c of childrenOf(p.id)) rows.push({ item: c, depth: 1 })
    }
    return rows
  }, [items])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={t('nav.mgmt.title', 'Navigation')}
          subtitle={t('nav.mgmt.subtitle', 'Manage the sidebar menu — items, order, icons, and which permission reveals each.')}
        />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('nav.mgmt.add', 'Add menu item')}
        </Button>
      </div>

      <ErrorBoundary scope="pane">
        {isLoading ? (
          <Skeleton variant="list" />
        ) : ordered.length === 0 ? (
          <EmptyState variant="generic" title={t('nav.mgmt.empty', 'No menu items')} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full text-sm" aria-label={t('nav.mgmt.title', 'Navigation')}>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                  {['', t('nav.mgmt.col.label', 'Label'), t('nav.mgmt.col.key', 'Key'), t('nav.mgmt.col.url', 'URL'),
                    t('nav.mgmt.col.perms', 'Permissions'), t('nav.mgmt.col.status', 'Status'), ''].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map(({ item, depth }) => {
                  const Icon = navIcon(item.iconKey)
                  return (
                    <tr key={item.id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-sunken)]">
                      <td className="pl-3 pr-1 py-2.5 w-8 text-[var(--text-tertiary)]"><GripVertical className="h-4 w-4" aria-hidden="true" /></td>
                      <td className="px-3 py-2.5">
                        <div className={cn('flex items-center gap-2', depth > 0 && 'pl-5')}>
                          <Icon className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                          <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><code className="text-xs text-[var(--text-tertiary)] font-mono">{item.key}</code></td>
                      <td className="px-3 py-2.5"><code className="text-xs text-[var(--text-tertiary)] font-mono">{item.url}</code></td>
                      <td className="px-3 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs',
                          item.permissionIds.length === 0
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]')}>
                          {item.permissionIds.length === 0
                            ? t('nav.mgmt.public', 'Public')
                            : t('nav.mgmt.permCount', '{{n}} permission(s)').replace('{{n}}', String(item.permissionIds.length))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          item.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400')}>
                          {item.isActive ? t('nav.mgmt.active', 'Active') : t('nav.mgmt.inactive', 'Hidden')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(item)} aria-label={t('common.edit', 'Edit')}>
                            <Pencil className="h-4 w-4 text-[var(--text-tertiary)]" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(item)} aria-label={t('common.delete', 'Delete')}>
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ErrorBoundary>

      {(creating || editing) && (
        <NavItemDialog
          item={editing}
          allItems={items}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); invalidate() }}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('nav.mgmt.delete.title', 'Delete menu item')}
        description={t('nav.mgmt.delete.desc', 'It will be removed from the sidebar. Child items are promoted to top level.')}
        footer={
          <>
            <Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {t('common.delete', 'Delete')}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
          </>
        }
      >
        {deleteTarget && <p className="text-sm py-1"><strong className="text-[var(--text-primary)]">{deleteTarget.label}</strong></p>}
      </Dialog>
    </div>
  )
}

// ── Add / Edit dialog ───────────────────────────────────────────────────────

function NavItemDialog({
  item, allItems, onClose, onSaved,
}: {
  item: NavigationItemAdmin | null
  allItems: NavigationItemAdmin[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const isEdit = item !== null
  const [key, setKey] = useState(item?.key ?? '')
  const [label, setLabel] = useState(item?.label ?? '')
  const [url, setUrl] = useState(item?.url ?? '')
  const [iconKey, setIconKey] = useState(item?.iconKey ?? '')
  const [displayOrder, setDisplayOrder] = useState(item?.displayOrder ?? 100)
  const [parentId, setParentId] = useState(item?.parentId ?? '')
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [permIds, setPermIds] = useState<Set<string>>(new Set(item?.permissionIds ?? []))
  const [permSearch, setPermSearch] = useState('')

  const { data: catalog = [] } = useQuery({
    queryKey: ['auth', 'permissions', 'catalog'],
    queryFn: () => listPermissions(),
    staleTime: 5 * 60_000,
  })
  const allPerms = useMemo(() => catalog.flatMap(m => m.permissions), [catalog])
  const filteredPerms = allPerms.filter(p =>
    !permSearch || p.name.toLowerCase().includes(permSearch.toLowerCase()))

  // Top-level items (excluding self) are eligible parents.
  const parentOptions = allItems.filter(i => !i.parentId && i.id !== item?.id)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        label: label.trim(), url: url.trim(),
        iconKey: iconKey || null, displayOrder,
        parentId: parentId || null, isActive,
        permissionIds: Array.from(permIds),
      }
      return isEdit
        ? updateNavigationItem(item!.id, payload)
        : createNavigationItem({ key: key.trim(), ...payload }).then(() => undefined)
    },
    onSuccess: () => { toast.success(isEdit ? t('nav.mgmt.saved', 'Menu item saved') : t('nav.mgmt.created', 'Menu item created')); onSaved() },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'Navigation.Duplicate') toast.error(t('nav.mgmt.dupKey', 'A menu item with that key already exists'))
      else toast.error(t('nav.mgmt.saveError', 'Failed to save menu item'))
    },
  })

  const keyValid = isEdit || /^[a-z0-9_.]+$/.test(key)
  const canSave = label.trim() && url.trim() && keyValid && !save.isPending

  const field = 'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]'

  return (
    <Dialog
      open onClose={onClose}
      title={isEdit ? t('nav.mgmt.edit.title', 'Edit menu item') : t('nav.mgmt.add', 'Add menu item')}
      size="lg"
      footer={
        <>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!canSave}>
            {t('common.save', 'Save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
        </>
      }
    >
      <div className="space-y-4 py-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('nav.mgmt.field.key', 'Key')} *</label>
            <input value={key} disabled={isEdit} onChange={e => setKey(e.target.value.toLowerCase())}
              placeholder="reports.advanced" className={cn(field, 'font-mono', isEdit && 'opacity-60')} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('nav.mgmt.field.label', 'Label')} *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Advanced Reports" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('nav.mgmt.field.url', 'URL')} *</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="/reports/advanced" className={cn(field, 'font-mono')} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('nav.mgmt.field.order', 'Display order')}</label>
            <input type="number" value={displayOrder} onChange={e => setDisplayOrder(Number(e.target.value))} className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('nav.mgmt.field.icon', 'Icon')}</label>
            <select value={iconKey} onChange={e => setIconKey(e.target.value)} className={field}>
              <option value="">{t('nav.mgmt.noIcon', '(none)')}</option>
              {NAV_ICON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('nav.mgmt.field.parent', 'Parent')}</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} className={field}>
              <option value="">{t('nav.mgmt.topLevel', '(top level)')}</option>
              {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <Toggle checked={isActive} onChange={() => setIsActive(v => !v)} size="sm" id="nav-active" />
          {t('nav.mgmt.field.active', 'Visible in sidebar')}
        </label>

        {/* Permission picker */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            {t('nav.mgmt.field.perms', 'Required permissions')}
            <span className="text-[var(--text-tertiary)] font-normal ml-1">{t('nav.mgmt.permsHint', '(none = visible to all; otherwise any one grants access)')}</span>
          </label>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input value={permSearch} onChange={e => setPermSearch(e.target.value)} placeholder={t('nav.mgmt.permSearch', 'Search permissions…')} className={cn(field, 'pl-9')} />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {filteredPerms.slice(0, 100).map(p => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--surface-sunken)] cursor-pointer">
                <input type="checkbox" checked={permIds.has(p.id)} onChange={() => setPermIds(prev => {
                  const next = new Set(prev)
                  if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                  return next
                })} />
                <code className="text-xs font-mono text-[var(--text-secondary)]">{p.name}</code>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
