import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { cn } from '@/lib/utils'

interface ItcMismatchItem {
  id: string
  businessName: string
  gstin: string
  period: string
  itcPer3b: number
  itcPer2a: number
  difference: number
  percentDiff: number
  status: 'Pending' | 'Resolved' | 'Disputed'
}

const mockMismatches: ItcMismatchItem[] = [
  { id: '1', businessName: 'Sharma Trading Co.', gstin: '27AABCS1429B1ZB', period: 'March 2026', itcPer3b: 48500, itcPer2a: 45200, difference: 3300, percentDiff: 7.3, status: 'Pending' },
  { id: '2', businessName: 'Patel Textiles', gstin: '24AAPCP2345B1Z2', period: 'March 2026', itcPer3b: 125000, itcPer2a: 118000, difference: 7000, percentDiff: 5.9, status: 'Pending' },
  { id: '3', businessName: 'Gupta Electrics', gstin: '07AACPG4567B1Z3', period: 'February 2026', itcPer3b: 67200, itcPer2a: 45000, difference: 22200, percentDiff: 49.3, status: 'Disputed' },
  { id: '4', businessName: 'Nair Enterprises', gstin: '32BBBCN5678A1ZC', period: 'March 2026', itcPer3b: 34000, itcPer2a: 36500, difference: -2500, percentDiff: -6.8, status: 'Resolved' },
]

const columns: ColumnDef<ItcMismatchItem>[] = [
  {
    accessorKey: 'businessName',
    header: 'Business',
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium text-neutral-800">{row.original.businessName}</p>
        <p className="font-mono text-xs text-neutral-400">{row.original.gstin}</p>
      </div>
    ),
  },
  { accessorKey: 'period', header: 'Period', cell: ({ row }) => <span className="text-sm">{row.original.period}</span> },
  {
    accessorKey: 'itcPer3b',
    header: 'ITC per 3B',
    cell: ({ row }) => <AmountDisplay amount={row.original.itcPer3b} size="sm" />,
  },
  {
    accessorKey: 'itcPer2a',
    header: 'ITC per 2A/2B',
    cell: ({ row }) => <AmountDisplay amount={row.original.itcPer2a} size="sm" />,
  },
  {
    accessorKey: 'difference',
    header: 'Difference',
    cell: ({ row }) => (
      <AmountDisplay
        amount={Math.abs(row.original.difference)}
        size="sm"
        colorCode
        sign={row.original.difference > 0 ? 'positive' : 'negative'}
      />
    ),
  },
  {
    accessorKey: 'percentDiff',
    header: '% Diff',
    cell: ({ row }) => {
      const pct = Math.abs(row.original.percentDiff)
      const color = pct > 10 ? 'text-error-600' : pct > 5 ? 'text-warning-600' : 'text-neutral-600'
      return <span className={cn('text-sm font-mono font-medium', color)}>{row.original.percentDiff > 0 ? '+' : ''}{row.original.percentDiff.toFixed(1)}%</span>
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const variant = row.original.status === 'Resolved' ? 'success' : row.original.status === 'Disputed' ? 'error' : 'warning'
      return <Badge variant={variant} dot>{row.original.status}</Badge>
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: () => (
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm">Review</Button>
        <Button variant="ghost" size="sm">Resolve</Button>
        <Button variant="ghost" size="sm">Callback</Button>
      </div>
    ),
  },
]

export default function ItcMismatchPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['itc-mismatches'],
    queryFn: async () => { await new Promise(r => setTimeout(r, 300)); return mockMismatches },
  })

  const totalMismatch = (data ?? []).reduce((sum, d) => sum + Math.abs(d.difference), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="ITC Mismatch Tracker"
        subtitle={`${(data ?? []).length} businesses with ITC mismatches · Total mismatch: ₹${(totalMismatch / 100000).toFixed(1)}L`}
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-neutral-500">Total Mismatches</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums mt-1">{(data ?? []).length}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Total Amount</p>
          <AmountDisplay amount={totalMismatch} size="lg" colorCode />
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Critical (&gt;10%)</p>
          <p className="text-2xl font-bold text-error-600 tabular-nums mt-1">
            {(data ?? []).filter(d => Math.abs(d.percentDiff) > 10).length}
          </p>
        </Card>
      </div>

      <DataTable
        data={data ?? []}
        columns={columns}
        loading={isLoading}
      />
    </div>
  )
}
