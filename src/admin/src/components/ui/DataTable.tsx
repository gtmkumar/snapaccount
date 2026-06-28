import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
} from '@tanstack/react-table'
import { useState, useEffect, useRef, useCallback, type ReactNode, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, AlignJustify, LayoutList } from 'lucide-react'
import { useListKeyboard } from '@/hooks/useListKeyboard'
import { t } from '@/i18n'

export type DataTableDensity = 'roomy' | 'compact'

/**
 * DG-ADMIN-10: Per-table density preference persisted to localStorage keyed by tableId.
 * Reads the stored value on mount; falls back to the prop value.
 */
function useDensityPref(tableId: string | undefined, defaultDensity: DataTableDensity): [DataTableDensity, (d: DataTableDensity) => void] {
  const key = tableId ? `snap_dt_density_${tableId}` : undefined
  const [density, setDensityState] = useState<DataTableDensity>(() => {
    if (!key) return defaultDensity
    try { return (localStorage.getItem(key) as DataTableDensity) ?? defaultDensity } catch { return defaultDensity }
  })
  const setDensity = useCallback((d: DataTableDensity) => {
    setDensityState(d)
    if (key) try { localStorage.setItem(key, d) } catch { /* noop */ }
  }, [key])
  return [density, setDensity]
}

interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData>[]
  loading?: boolean
  pageSize?: number
  onRowClick?: (row: TData) => void
  globalFilter?: string
  emptyState?: ReactNode
  className?: string
  showPagination?: boolean
  /** Called when the 'r' shortcut is pressed — refresh the data */
  onRefresh?: () => void
  /** Called when the 'f' shortcut is pressed — open filter drawer */
  onFilter?: () => void
  /**
   * DG-ADMIN-10: Initial density variant. 'roomy' (default) uses py-3 14px rows;
   * 'compact' uses py-2 13px tabular-nums rows (32px row / 36px header).
   * When tableId is set the user's choice is persisted to localStorage.
   */
  density?: DataTableDensity
  /**
   * DG-ADMIN-10: Stable ID for this table instance. Required for density-toggle
   * persistence (stored as snap_dt_density_{tableId} in localStorage).
   * Also enables a toolbar density toggle when provided.
   */
  tableId?: string
  /**
   * DG-ADMIN-10: When true, show a density toggle button in the top-right toolbar.
   * Defaults to true when tableId is provided.
   */
  showDensityToggle?: boolean
}

export function DataTable<TData>({
  data,
  columns,
  loading = false,
  pageSize = 25,
  onRowClick,
  globalFilter,
  emptyState,
  className,
  showPagination = true,
  onRefresh,
  onFilter,
  density: densityProp = 'roomy',
  tableId,
  showDensityToggle,
}: DataTableProps<TData>) {
  // DG-ADMIN-10: density state — persisted when tableId is provided
  const [density, setDensity] = useDensityPref(tableId, densityProp)
  const showToggle = showDensityToggle !== undefined ? showDensityToggle : !!tableId

  // DG-ADMIN-10: density-derived class maps
  const thPadding = density === 'compact' ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs'
  const tdPadding = density === 'compact' ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-3'
  const tdNumeric = density === 'compact' ? 'tabular-nums' : ''
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  // DG-ADMIN-02: list-context keyboard shortcuts (j/k/x/a/r/f)
  const visibleRows = data  // useReactTable filters happen below; we sync rowCount after
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  const { activeIndex, resetActiveIndex, containerProps } = useListKeyboard({
    rowCount: data.length,
    onOpen: (i) => {
      const row = visibleRows[i]
      if (row !== undefined && onRowClick) onRowClick(row)
    },
    onRefresh,
    onFilter,
  })

  // Reset active index when data changes
  useEffect(() => {
    resetActiveIndex()
    rowRefs.current = []
  }, [data, resetActiveIndex])

  // Scroll active row into view when j/k moves focus
  useEffect(() => {
    if (activeIndex >= 0 && rowRefs.current[activeIndex]) {
      rowRefs.current[activeIndex]?.focus()
    }
  }, [activeIndex])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
      globalFilter,
    },
  })

  return (
    <div className={cn('flex flex-col gap-3', className)} {...containerProps}>
      {/* DG-ADMIN-10: density toggle toolbar (only when tableId provided or showDensityToggle=true) */}
      {showToggle && (
        <div className="flex justify-end">
          <div
            role="group"
            aria-label={t('dataTable.density.label')}
            className="inline-flex rounded-lg border border-[var(--border-default)] overflow-hidden"
          >
            {(['roomy', 'compact'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                title={d === 'roomy' ? t('dataTable.density.roomy') : t('dataTable.density.compact')}
                aria-pressed={density === d}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors',
                  density === d
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]'
                )}
              >
                {d === 'roomy'
                  ? <AlignJustify className="h-3.5 w-3.5" aria-hidden="true" />
                  : <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="hidden sm:inline">
                  {d === 'roomy' ? t('dataTable.density.roomy') : t('dataTable.density.compact')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] shadow-sm">
        <table className="w-full text-sm" role="grid">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[var(--surface-sunken)] border-b border-[var(--border-subtle)]">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      thPadding,
                      'text-left font-semibold text-[var(--text-tertiary)] uppercase tracking-wider whitespace-nowrap',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-[var(--text-secondary)]'
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                    }
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-[var(--text-disabled)]" aria-hidden="true">
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={cn(i % 2 === 1 && 'bg-[var(--surface-sunken)]/50')}>
                  {columns.map((_, j) => (
                    <td key={j} className={tdPadding}>
                      <div className="h-4 rounded skeleton-shimmer" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                  {emptyState ?? (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-8 w-8 text-[var(--text-disabled)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-sm">No records found</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  ref={(el) => { rowRefs.current[rowIndex] = el }}
                  className={cn(
                    'transition-colors',
                    rowIndex % 2 === 1 && 'bg-[var(--surface-sunken)]/40',
                    onRowClick && 'cursor-pointer hover:bg-[var(--surface-sunken)]',
                    rowIndex === activeIndex && 'ring-2 ring-inset ring-[var(--border-focus)]'
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  // Roving tabindex: active row is 0, all others -1
                  tabIndex={rowIndex === activeIndex ? 0 : (onRowClick ? -1 : undefined)}
                  aria-selected={rowIndex === activeIndex ? true : undefined}
                  onKeyDown={(e: KeyboardEvent<HTMLTableRowElement>) => {
                    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      onRowClick(row.original)
                    }
                  }}
                  role={onRowClick ? 'row' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn(tdPadding, tdNumeric, 'text-[var(--text-secondary)]')}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--text-tertiary)]">
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}{' '}
            of {table.getFilteredRowModel().rows.length} records
          </p>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                table.getCanPreviousPage()
                  ? 'bg-[var(--surface-sunken)] text-[var(--text-primary)] hover:bg-[var(--badge-brand-bg)] hover:text-[var(--badge-brand-fg)]'
                  : 'bg-[var(--surface-raised)] text-[var(--text-disabled)]'
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>

            <span className="text-sm text-[var(--text-tertiary)] px-2 tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>

            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                table.getCanNextPage()
                  ? 'bg-[var(--surface-sunken)] text-[var(--text-primary)] hover:bg-[var(--badge-brand-bg)] hover:text-[var(--badge-brand-fg)]'
                  : 'bg-[var(--surface-raised)] text-[var(--text-disabled)]'
              )}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
