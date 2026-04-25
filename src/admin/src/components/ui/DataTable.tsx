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
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'

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
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

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
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm" role="grid">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-neutral-50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider whitespace-nowrap',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-neutral-700'
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
                        <span className="text-neutral-400" aria-hidden="true">
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
                <tr key={i} className={cn(i % 2 === 1 && 'bg-neutral-50/50')}>
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded skeleton-shimmer" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-neutral-500">
                  {emptyState ?? (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-8 w-8 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
                  className={cn(
                    'transition-colors',
                    rowIndex % 2 === 1 && 'bg-neutral-50/50',
                    onRowClick && 'cursor-pointer hover:bg-brand-50/30'
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick(row.original)
                    }
                  } : undefined}
                  role={onRowClick ? 'button' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-neutral-700">
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
          <p className="text-sm text-neutral-500">
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
                  ? 'bg-neutral-100 text-neutral-700 hover:bg-brand-50 hover:text-brand-600'
                  : 'bg-neutral-50 text-neutral-400'
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>

            <span className="text-sm text-neutral-500 px-2 tabular-nums">
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
                  ? 'bg-neutral-100 text-neutral-700 hover:bg-brand-50 hover:text-brand-600'
                  : 'bg-neutral-50 text-neutral-400'
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
