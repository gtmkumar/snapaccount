/**
 * ReferenceDataPage — Auth/RBAC Module 1, Increment 1.4 Phase A
 *
 * SUPER_ADMIN manages lookup / master data behind app dropdowns.
 * Route: /settings/reference-data  (gated platform.refdata.manage)
 *
 * Category is synced to ?category= in the URL so tabs are linkable.
 * i18n: @/i18n t() (NOT react-i18next).
 */
import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Pencil, Trash2, Copy, Check,
  CheckCircle2, AlertTriangle,
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
  listReferenceData, createRefDataEntry, updateRefDataEntry, deleteRefDataEntry,
  refDataQueryKey, CODE_REGEX,
  type RefDataItem, type RefDataCategory, type RefDataApiErrorCode,
  REFDATA_CATEGORIES,
} from '@/lib/referenceDataApi'

// ─────────────────────────────────────────────────────────────────────────────
// Category display map
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<RefDataCategory, string> = {
  LANGUAGE: 'refdata.category.language',
  USER_TYPE: 'refdata.category.userType',
  GENDER:    'refdata.category.gender',
  STATE:     'refdata.category.state',
  COUNTRY:   'refdata.category.country',
}

function catLabel(cat: RefDataCategory): string {
  return t(CATEGORY_LABELS[cat])
}

// Validate that a URL ?category= value is a known category
function parseCategoryParam(raw: string | null): RefDataCategory {
  if (raw && (REFDATA_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as RefDataCategory
  }
  return 'LANGUAGE'
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ReferenceDataPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const category = parseCategoryParam(searchParams.get('category'))

  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active')

  const [showDialog, setShowDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<RefDataItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RefDataItem | null>(null)

  const queryClient = useQueryClient()

  // Fetch all entries for this category (activeOnly=false so inactive rows show too)
  const { data: items, isLoading, error } = useQuery({
    queryKey: refDataQueryKey(category),
    queryFn: () => listReferenceData(category, false),
    staleTime: 60_000,
  })

  // Country list for STATE parent display (active only)
  const { data: countries } = useQuery({
    queryKey: refDataQueryKey('COUNTRY', true),
    queryFn: () => listReferenceData('COUNTRY', true),
    staleTime: 5 * 60_000,
    enabled: category === 'STATE',
  })

  const countryByCode = useMemo(() => {
    const m = new Map<string, RefDataItem>()
    countries?.forEach(c => m.set(c.code, c))
    return m
  }, [countries])

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let rows = items ?? []
    if (activeFilter === 'active') rows = rows.filter(r => r.isActive)
    else if (activeFilter === 'inactive') rows = rows.filter(r => !r.isActive)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      )
    }
    // Default sort: sortOrder asc, then name asc
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }, [items, activeFilter, search])

  const hasAny = (items?.length ?? 0) > 0

  // ── Switch category ───────────────────────────────────────────────────────

  const switchCategory = (cat: RefDataCategory) => {
    setSearchParams({ category: cat })
    setSearch('')
    setActiveFilter('active')
  }

  // ── Optimistic active toggle ──────────────────────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateRefDataEntry(id, { isActive }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: refDataQueryKey(category) })
      const prev = queryClient.getQueryData(refDataQueryKey(category))
      queryClient.setQueryData(refDataQueryKey(category), (old: RefDataItem[] | undefined) =>
        old?.map(r => r.id === id ? { ...r, isActive } : r)
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(refDataQueryKey(category), ctx.prev)
      toast.error(t('refdata.error.generic'))
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: refDataQueryKey(category) }),
  })

  const openCreate = () => { setEditTarget(null); setShowDialog(true) }
  const openEdit = (item: RefDataItem) => { setEditTarget(item); setShowDialog(true) }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={t('refdata.title')}
          subtitle={t('refdata.subtitle')}
        />
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t('refdata.addEntry')}
        </Button>
      </div>

      {/* Category segmented control */}
      <div
        role="radiogroup"
        aria-label={t('refdata.title')}
        className="flex rounded-lg border border-[var(--border-default)] overflow-hidden self-start w-fit"
      >
        {REFDATA_CATEGORIES.map(cat => (
          <button
            key={cat}
            role="radio"
            aria-checked={category === cat}
            onClick={() => switchCategory(cat)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              category === cat
                ? 'bg-[var(--brand-primary)] text-white'
                : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
            )}
          >
            {catLabel(cat)}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('refdata.search')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>
        {/* Active/Inactive/All filter */}
        <div
          role="radiogroup"
          aria-label={t('refdata.filter.active')}
          className="flex rounded-lg border border-[var(--border-default)] overflow-hidden"
        >
          {(['active', 'inactive', 'all'] as const).map(opt => (
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
              {opt === 'active' ? t('refdata.filter.active') : opt === 'inactive' ? t('refdata.filter.inactive') : t('refdata.filter.all')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <ErrorBoundary scope="route">
        {isLoading ? (
          <Skeleton variant="dataTableDense" />
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-secondary)]">{t('refdata.error.generic')}</p>
          </div>
        ) : !hasAny ? (
          <EmptyState
            variant="generic"
            title={t('refdata.empty.title', { category: catLabel(category) })}
            description={t('refdata.empty.desc')}
            primaryCta={{ label: t('refdata.addEntry'), onPress: openCreate }}
          />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {t('refdata.empty.noMatch', { query: search || activeFilter })}
            </p>
            <button
              onClick={() => { setSearch(''); setActiveFilter('all') }}
              className="text-sm text-[var(--brand-primary)] hover:underline"
            >
              {t('refdata.empty.clear')}
            </button>
          </div>
        ) : (
          <RefDataTable
            items={filtered}
            category={category}
            countryByCode={countryByCode}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onToggleActive={(item, isActive) => toggleMutation.mutate({ id: item.id, isActive })}
            togglePending={toggleMutation.isPending}
          />
        )}
      </ErrorBoundary>

      {/* Create / Edit dialog */}
      <ReferenceDataDialog
        open={showDialog}
        category={category}
        editItem={editTarget}
        onClose={() => setShowDialog(false)}
      />

      {/* Delete / deactivate confirm dialog */}
      {deleteTarget && (
        <DeleteDialog
          item={deleteTarget}
          category={category}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RefDataTable
// ─────────────────────────────────────────────────────────────────────────────

function RefDataTable({
  items, category, countryByCode,
  onEdit, onDelete, onToggleActive, togglePending,
}: {
  items: RefDataItem[]
  category: RefDataCategory
  countryByCode: Map<string, RefDataItem>
  onEdit: (item: RefDataItem) => void
  onDelete: (item: RefDataItem) => void
  onToggleActive: (item: RefDataItem, isActive: boolean) => void
  togglePending: boolean
}) {
  const showCountry = category === 'STATE'

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      {/* Column headers */}
      <div className={cn(
        'grid items-center gap-2 px-4 py-2 bg-[var(--surface-sunken)] text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide',
        showCountry
          ? 'grid-cols-[1fr_120px_160px_72px_64px_80px]'
          : 'grid-cols-[1fr_120px_72px_64px_80px]'
      )}>
        <span>{t('refdata.col.name')}</span>
        <span>{t('refdata.col.code')}</span>
        {showCountry && <span>{t('refdata.col.country')}</span>}
        <span className="text-center">{t('refdata.col.active')}</span>
        <span className="text-right">{t('refdata.col.sortOrder')}</span>
        <span className="text-right">{t('refdata.col.actions')}</span>
      </div>

      <div className="divide-y divide-[var(--border-subtle)]">
        {items.map(item => (
          <RefDataRow
            key={item.id}
            item={item}
            showCountry={showCountry}
            countryByCode={countryByCode}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
            onToggleActive={(v) => onToggleActive(item, v)}
            togglePending={togglePending}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RefDataRow
// ─────────────────────────────────────────────────────────────────────────────

function RefDataRow({
  item, showCountry, countryByCode,
  onEdit, onDelete, onToggleActive, togglePending,
}: {
  item: RefDataItem
  showCountry: boolean
  countryByCode: Map<string, RefDataItem>
  onEdit: () => void
  onDelete: () => void
  onToggleActive: (v: boolean) => void
  togglePending: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(item.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const parent = item.parentCode ? countryByCode.get(item.parentCode) : undefined

  return (
    <div className={cn(
      'grid items-center gap-2 px-4 py-2.5 bg-[var(--surface-raised)] transition-colors',
      showCountry
        ? 'grid-cols-[1fr_120px_160px_72px_64px_80px]'
        : 'grid-cols-[1fr_120px_72px_64px_80px]',
      !item.isActive && 'opacity-60',
    )}>
      {/* Name */}
      <span className={cn('text-sm truncate', item.isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]')}>
        {item.name}
      </span>

      {/* Code — copy on click */}
      <div>
        <button
          onClick={handleCopy}
          title={copied ? t('refdata.codeCopied') : t('common.copy')}
          aria-label={`${t('common.copy')}: ${item.code}`}
          className="flex items-center gap-1.5 group"
        >
          <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
            {item.code}
          </code>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            {copied
              ? <Check className="h-3 w-3 text-emerald-500" />
              : <Copy className="h-3 w-3 text-[var(--text-tertiary)]" />}
          </span>
        </button>
        <span aria-live="polite" className="sr-only">{copied ? t('refdata.codeCopied') : ''}</span>
      </div>

      {/* Country parent (STATE only) */}
      {showCountry && (
        <span className="text-sm text-[var(--text-secondary)] truncate">
          {parent
            ? <>{parent.name} <code className="font-mono text-xs text-[var(--text-tertiary)]">({parent.code})</code></>
            : <span className="text-[var(--text-tertiary)]">—</span>}
        </span>
      )}

      {/* Active toggle */}
      <div className="flex justify-center">
        <Toggle
          checked={item.isActive}
          onChange={onToggleActive}
          loading={togglePending}
          size="sm"
          id={`refdata-active-${item.id}`}
        />
      </div>

      {/* Sort order */}
      <span className="text-sm text-right text-[var(--text-secondary)] tabular-nums">
        {item.sortOrder}
      </span>

      {/* Actions */}
      <div className="flex items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`${t('refdata.col.actions')} edit: ${item.name}`}
        >
          <Pencil className="h-4 w-4 text-[var(--text-secondary)]" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={`${t('refdata.delete.cta')}: ${item.name}`}
        >
          <Trash2 className="h-4 w-4 text-rose-500" />
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReferenceDataDialog — create + edit (category locked to current tab)
// ─────────────────────────────────────────────────────────────────────────────

function ReferenceDataDialog({
  open, category, editItem, onClose,
}: {
  open: boolean
  category: RefDataCategory
  editItem: RefDataItem | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editItem

  const [name, setName] = useState(editItem?.name ?? '')
  const [code, setCode] = useState(editItem?.code ?? '')
  const [parentCode, setParentCode] = useState(editItem?.parentCode ?? '')
  const [sortOrder, setSortOrder] = useState(String(editItem?.sortOrder ?? 0))
  const [isActive, setIsActive] = useState(editItem?.isActive !== false)
  const [duplicateError, setDuplicateError] = useState(false)
  const [parentError, setParentError] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [countryDropOpen, setCountryDropOpen] = useState(false)

  // Reset when dialog opens/item changes
  const prevKey = `${open}-${editItem?.id ?? 'new'}-${category}`
  const [lastKey, setLastKey] = useState(prevKey)
  if (prevKey !== lastKey) {
    setLastKey(prevKey)
    setName(editItem?.name ?? '')
    setCode(editItem?.code ?? '')
    setParentCode(editItem?.parentCode ?? '')
    setSortOrder(String(editItem?.sortOrder ?? 0))
    setIsActive(editItem?.isActive !== false)
    setDuplicateError(false)
    setParentError('')
    setCountrySearch('')
  }

  const isValidCode = CODE_REGEX.test(code)
  const isStateCategory = category === 'STATE'

  // Countries for the parent combobox
  const { data: countries } = useQuery({
    queryKey: refDataQueryKey('COUNTRY', true),
    queryFn: () => listReferenceData('COUNTRY', true),
    enabled: open && isStateCategory,
    staleTime: 5 * 60_000,
  })

  const filteredCountries = useMemo(() => {
    const all = countries ?? []
    if (!countrySearch) return all
    const q = countrySearch.toLowerCase()
    return all.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
  }, [countries, countrySearch])

  const selectedCountry = countries?.find(c => c.code === parentCode)

  const mutation = useMutation<RefDataItem | void>({
    mutationFn: () => {
      const sort = parseInt(sortOrder, 10)
      if (isEdit) {
        return updateRefDataEntry(editItem.id, {
          name: name.trim(),
          parentCode: isStateCategory ? parentCode || undefined : undefined,
          sortOrder: isNaN(sort) ? 0 : sort,
          isActive,
        })
      }
      return createRefDataEntry({
        category,
        code: code.trim(),
        name: name.trim(),
        parentCode: isStateCategory ? parentCode || undefined : undefined,
        sortOrder: isNaN(sort) ? 0 : sort,
        isActive,
      })
    },
    onSuccess: () => {
      toast.success(isEdit ? t('refdata.edit.success') : t('refdata.create.success', { name: name.trim() }))
      void queryClient.invalidateQueries({ queryKey: refDataQueryKey(category) })
      // If a country changed also invalidate the country list (states depend on it)
      if (category === 'COUNTRY' || category === 'STATE') {
        void queryClient.invalidateQueries({ queryKey: refDataQueryKey('COUNTRY', true) })
      }
      onClose()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { code?: string } } })?.response?.status
      const errCode = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as RefDataApiErrorCode | undefined
      if (status === 409 && errCode === 'ReferenceData.Duplicate') {
        setDuplicateError(true)
      } else if (status === 400 && (errCode === 'ReferenceData.ParentCodeRequired' || errCode === 'ReferenceData.InvalidParentCode')) {
        setParentError(t('refdata.create.parentRequired'))
      } else if (status === 403) {
        toast.error(t('refdata.error.forbidden'))
      } else {
        toast.error(t('refdata.error.generic'))
      }
    },
  })

  const canSave =
    name.trim().length > 0 &&
    (isEdit || isValidCode) &&
    (!isStateCategory || !!parentCode) &&
    !mutation.isPending

  const title = isEdit
    ? t('refdata.dialog.editTitle', { category: catLabel(category) })
    : t('refdata.dialog.addTitle', { category: catLabel(category) })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSave}
          >
            {t('refdata.create.submit')}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        {/* Category — read-only */}
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">
            {t('refdata.field.category')}
          </p>
          <span className="text-sm font-medium text-[var(--text-primary)]">{catLabel(category)}</span>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('refdata.field.name')} <span className="text-rose-500">*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Karnataka"
            autoFocus
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>

        {/* Code */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('refdata.field.code')} <span className="text-rose-500">*</span>
          </label>
          {isEdit ? (
            <>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] font-mono text-sm text-[var(--text-secondary)]">
                  {editItem.code}
                </code>
              </div>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('refdata.edit.codeImmutable')}</p>
            </>
          ) : (
            <>
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
                <input
                  value={code}
                  onChange={e => { setCode(e.target.value); setDuplicateError(false) }}
                  placeholder="KA"
                  className="flex-1 bg-transparent focus:outline-none"
                />
                {code && isValidCode && !duplicateError && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-label={t('refdata.create.valid')} />
                )}
              </div>
              {code && !isValidCode && (
                <p className="mt-1 text-xs text-rose-600">{t('refdata.create.invalidCode')}</p>
              )}
              {duplicateError && (
                <p className="mt-1 text-xs text-rose-600">
                  {t('refdata.create.duplicate', { category: catLabel(category) })}
                </p>
              )}
              {code && isValidCode && !duplicateError && (
                <p className="mt-1 text-xs text-emerald-600">{t('refdata.create.valid')}</p>
              )}
            </>
          )}
        </div>

        {/* Country parent — STATE only */}
        {isStateCategory && (
          <div className="relative">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('refdata.field.country')} <span className="text-rose-500">*</span>
            </label>
            <input
              value={selectedCountry ? `${selectedCountry.name} (${selectedCountry.code})` : countrySearch}
              onChange={e => { setCountrySearch(e.target.value); setParentCode(''); setParentError(''); setCountryDropOpen(true) }}
              onFocus={() => setCountryDropOpen(true)}
              onBlur={() => setTimeout(() => setCountryDropOpen(false), 150)}
              placeholder="India (IN)"
              aria-describedby="country-hint"
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                parentError ? 'border-rose-500' : 'border-[var(--border-default)]'
              )}
            />
            <p id="country-hint" className="mt-1 text-xs text-[var(--text-tertiary)]">{t('refdata.field.countryHint')}</p>
            {parentError && <p className="mt-1 text-xs text-rose-600">{parentError}</p>}
            {countryDropOpen && filteredCountries.length > 0 && (
              <div className="absolute z-20 top-[calc(100%-1.5rem)] mt-1 left-0 right-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] max-h-48 overflow-y-auto">
                {filteredCountries.map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => { setParentCode(c.code); setCountrySearch(''); setParentError(''); setCountryDropOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                  >
                    {c.name} <code className="font-mono text-xs text-[var(--text-tertiary)]">({c.code})</code>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sort order + Active row */}
        <div className="grid grid-cols-2 gap-4 items-start">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('refdata.field.sortOrder')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>
          <div className="pt-7">
            <Toggle
              checked={isActive}
              onChange={setIsActive}
              label={t('refdata.field.active')}
              size="md"
            />
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DeleteDialog — confirm + in-use 409 guard + "Deactivate instead" path
// ─────────────────────────────────────────────────────────────────────────────

function DeleteDialog({
  item, category, onClose,
}: {
  item: RefDataItem
  category: RefDataCategory
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  // 'confirm' → initial state; 'inUse' → server blocked with 409
  const [state, setState] = useState<'confirm' | 'inUse'>('confirm')
  const [inUseCount, setInUseCount] = useState(0)

  const deleteMutation = useMutation({
    mutationFn: () => deleteRefDataEntry(item.id),
    onSuccess: () => {
      toast.success(t('refdata.delete.success'))
      void queryClient.invalidateQueries({ queryKey: refDataQueryKey(category) })
      if (category === 'COUNTRY') {
        void queryClient.invalidateQueries({ queryKey: refDataQueryKey('STATE') })
        void queryClient.invalidateQueries({ queryKey: refDataQueryKey('COUNTRY', true) })
      }
      onClose()
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { code?: string; count?: number } } })?.response?.status
      const errCode = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as RefDataApiErrorCode | undefined
      const count = (err as { response?: { data?: { count?: number } } })?.response?.data?.count ?? 0
      if (status === 409 && errCode === 'ReferenceData.InUse') {
        setState('inUse')
        setInUseCount(count)
      } else if (status === 403) {
        toast.error(t('refdata.error.forbidden'))
        onClose()
      } else {
        toast.error(t('refdata.error.generic'))
        onClose()
      }
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: () => updateRefDataEntry(item.id, { isActive: false }),
    onSuccess: () => {
      toast.success(t('refdata.edit.success'))
      void queryClient.invalidateQueries({ queryKey: refDataQueryKey(category) })
      onClose()
    },
    onError: () => {
      toast.error(t('refdata.error.generic'))
      onClose()
    },
  })

  const isPending = deleteMutation.isPending || deactivateMutation.isPending

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('refdata.delete.cta')}
      size="sm"
      footer={
        state === 'confirm' ? (
          <>
            <Button
              variant="primary"
              onClick={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {t('refdata.delete.cta')}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              onClick={() => deactivateMutation.mutate()}
              loading={deactivateMutation.isPending}
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {t('refdata.delete.deactivateInstead')}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              {t('common.cancel')}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3 py-2">
        {state === 'confirm' ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {t('refdata.delete.confirm', { name: item.name, code: item.code, category: catLabel(category) })}
          </p>
        ) : (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t('refdata.delete.inUse', { code: item.code })}
              </p>
              {inUseCount > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('refdata.delete.countryHasStates', { count: inUseCount })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
