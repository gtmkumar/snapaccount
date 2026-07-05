/**
 * BankCommunicationsPage — Phase 6C
 * Route: /loans/bank-communications
 * Cross-application audit log of all bank messages (email + REST + OAuth).
 * SplitView: DataGrid left, DetailPane right.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { Search, RefreshCw, MessageSquare, Download, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/layout/FilterBar'
import { DetailPanePlaceholder } from '@/components/shared/DetailPanePlaceholder'
import { DataTable } from '@/components/ui/DataTable'
import { MetricCard } from '@/components/shared/MetricCard'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { Skeleton } from '@/components/ui/Skeleton'
import { BankAdapterTypeBadge } from '@/components/ui/BankAdapterTypeBadge'
import { BankCommStatusBadge } from '@/components/ui/BankCommStatusBadge'
import { PayloadViewer } from '@/components/ui/PayloadViewer'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { t } from '@/i18n'
import {
  listBankCommunications,
  getBankCommKpi,
  resendBankMessage,
  listPartnerBanks,
  type BankCommMessage,
  type BankCommStatus,
} from '@/lib/loanApi'

// A message is resendable when an OUTBOUND attempt failed or bounced.
function isResendable(m: BankCommMessage): boolean {
  return m.direction === 'outbound' && (m.status === 'FAILED' || m.status === 'BOUNCED')
}

// ---------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------

function BankCommKpiStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ['bankCommKpi'],
    queryFn: getBankCommKpi,
    retry: 1,
  })

  const tiles = [
    { label: t('admin.bankComms.kpi.sentToday'), value: data?.sentToday ?? 0 },
    { label: t('admin.bankComms.kpi.pending'), value: data?.pending ?? 0 },
    { label: t('admin.bankComms.kpi.failed'), value: data?.failed ?? 0 },
    {
      label: t('admin.bankComms.kpi.avgResponse'),
      value: data?.avgResponseMinutes != null ? `${data.avgResponseMinutes.toFixed(0)}m` : '—',
    },
    {
      label: t('admin.bankComms.kpi.bounceRate'),
      value: data?.bounceRate != null ? `${data.bounceRate.toFixed(1)}%` : '—',
    },
  ]

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="!p-4 !py-5 h-20" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {tiles.map(tile => (
        <MetricCard key={tile.label} title={tile.label} value={tile.value} color="loan" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail pane
// ---------------------------------------------------------------------------

function DetailPane({
  message,
  onResend,
  resending,
}: {
  message: BankCommMessage | null
  onResend: (m: BankCommMessage) => void
  resending: boolean
}) {
  const navigate = useNavigate()

  if (!message) {
    return (
      <DetailPanePlaceholder>
        {t('admin.bankComms.selectHint')}
      </DetailPanePlaceholder>
    )
  }

  return (
    <Card padding="md" className="space-y-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[var(--text-primary)]">{message.bankName ?? '—'}</span>
            {message.adapterType && <BankAdapterTypeBadge adapterType={message.adapterType} />}
          </div>
          <BankCommStatusBadge status={message.status} />
        </div>
        <div className="flex items-center gap-2">
          {isResendable(message) && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RotateCw className="h-3.5 w-3.5" />}
              loading={resending}
              onClick={() => onResend(message)}
            >
              {t('admin.bankComms.action.resend')}
            </Button>
          )}
          {message.applicationId && (
            <Button
              size="sm"
              variant="ghost"
              rightIcon={<span className="text-xs">→</span>}
              onClick={() => void navigate(`/loans/${message.applicationId}`)}
            >
              {t('admin.bankComms.action.openApp')}
            </Button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <dl className="text-xs space-y-1.5 text-[var(--text-secondary)]">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-tertiary)]">{t('admin.bankComms.col.ts')}</dt>
          <dd>{formatDate(message.timestamp)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-tertiary)]">{t('admin.bankComms.col.direction')}</dt>
          <dd className="capitalize">{message.direction === 'outbound' ? '↑ Outbound' : '↓ Inbound'}</dd>
        </div>
        {message.subject && (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--text-tertiary)]">{t('admin.bankComms.col.subject')}</dt>
            <dd className="text-right max-w-xs truncate">{message.subject}</dd>
          </div>
        )}
        {message.endpoint && (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--text-tertiary)]">{t('admin.bankComms.col.endpoint')}</dt>
            <dd className="font-mono text-xs text-right max-w-xs truncate">{message.endpoint}</dd>
          </div>
        )}
        {message.responseStatus != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--text-tertiary)]">{t('admin.bankComms.responseCode')}</dt>
            <dd className={message.responseStatus >= 400 ? 'text-error-700 font-semibold' : 'text-success-700'}>
              {message.responseStatus}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-tertiary)]">{t('admin.bankComms.col.messageId')}</dt>
          <dd className="font-mono text-xs">{message.messageId}</dd>
        </div>
      </dl>

      {/* Payload */}
      {message.payloadMasked && (
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t('admin.bankComms.payload')}
          </p>
          <PayloadViewer
            kind={message.channel === 'email' ? 'email' : message.channel === 'oauth' ? 'oauth-token' : 'json'}
            payload={message.payloadMasked}
          />
        </div>
      )}

      {/* Response */}
      {message.responseMasked && (
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t('admin.bankComms.response')}
          </p>
          <PayloadViewer kind="json" payload={message.responseMasked} />
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type FilterState = {
  search: string
  status: BankCommStatus | ''
  direction: 'outbound' | 'inbound' | ''
  channel: 'email' | 'rest' | 'oauth' | ''
  bankId: string
  from: string
  to: string
}

export default function BankCommunicationsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<BankCommMessage | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    direction: '',
    channel: '',
    bankId: '',
    from: '',
    to: '',
  })

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  // Bank options for the filter dropdown.
  const { data: banksData } = useQuery({
    queryKey: ['partnerBanks', { forFilter: true }],
    queryFn: () => listPartnerBanks({ pageSize: 100 }),
    staleTime: 300_000,
  })
  const bankOptions = banksData?.items ?? []

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['bankCommunications', filters],
    queryFn: () =>
      listBankCommunications({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.direction ? { direction: filters.direction } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.bankId ? { bankId: filters.bankId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        pageSize: 200,
      }),
    retry: 1,
  })

  const messages = data?.items ?? []

  // Client-side search fallback
  const filtered = useMemo(() => {
    if (!filters.search) return messages
    const q = filters.search.toLowerCase()
    return messages.filter(
      m =>
        m.messageId.toLowerCase().includes(q) ||
        (m.applicationId ?? '').toLowerCase().includes(q) ||
        (m.bankName ?? '').toLowerCase().includes(q) ||
        (m.subject ?? '').toLowerCase().includes(q) ||
        (m.endpoint ?? '').toLowerCase().includes(q)
    )
  }, [messages, filters.search])

  // Resend a single failed/bounced outbound message.
  const resendMutation = useMutation({
    mutationFn: (m: BankCommMessage) => resendBankMessage(m.messageId, t('admin.bankComms.resend.reason')),
    onSuccess: () => {
      toast.success(t('admin.bankComms.resend.success'))
      void queryClient.invalidateQueries({ queryKey: ['bankCommunications'] })
      void queryClient.invalidateQueries({ queryKey: ['bankCommKpi'] })
    },
    onError: () => toast.error(t('admin.bankComms.resend.error')),
  })

  // Bulk "Retry all failed" over the currently-filtered view. (DataTable has no
  // per-row multi-select, so the bulk scope is the active filter, not hand-picked rows.)
  const failedInView = useMemo(() => filtered.filter(isResendable), [filtered])
  const bulkRetryMutation = useMutation({
    mutationFn: () => Promise.all(
      failedInView.map(m => resendBankMessage(m.messageId, t('admin.bankComms.resend.reason'))),
    ),
    onSuccess: () => {
      toast.success(t('admin.bankComms.retryAll.success', { count: failedInView.length }))
      void queryClient.invalidateQueries({ queryKey: ['bankCommunications'] })
      void queryClient.invalidateQueries({ queryKey: ['bankCommKpi'] })
    },
    onError: () => toast.error(t('admin.bankComms.resend.error')),
  })

  function handleExport() {
    const csv = toCsv(filtered, [
      { header: t('admin.bankComms.col.ts'), value: m => formatDate(m.timestamp) },
      { header: t('admin.bankComms.col.direction'), value: m => m.direction },
      { header: t('admin.bankComms.col.bank'), value: m => m.bankName ?? '' },
      { header: t('admin.bankComms.col.channel'), value: m => m.adapterType ?? '' },
      { header: t('admin.bankComms.col.app'), value: m => m.applicationId ?? '' },
      { header: t('admin.bankComms.col.subject'), value: m => m.subject ?? m.endpoint ?? '' },
      { header: t('admin.bankComms.col.status'), value: m => m.status },
      { header: t('admin.bankComms.responseCode'), value: m => m.responseStatus ?? '' },
      { header: t('admin.bankComms.col.messageId'), value: m => m.messageId },
    ])
    downloadCsv(csvFilename('bank-communications'), csv)
  }

  const columns = useMemo<ColumnDef<BankCommMessage>[]>(() => [
    {
      accessorKey: 'timestamp',
      header: t('admin.bankComms.col.ts'),
      cell: ({ getValue }) => (
        <span className="text-xs whitespace-nowrap">{formatDate(getValue<string>())}</span>
      ),
      size: 160,
    },
    {
      accessorKey: 'direction',
      header: t('admin.bankComms.col.direction'),
      cell: ({ getValue }) => (
        <span className="text-base" aria-label={getValue<string>()}>
          {getValue<string>() === 'outbound' ? '↑' : '↓'}
        </span>
      ),
      size: 56,
    },
    {
      accessorKey: 'bankName',
      header: t('admin.bankComms.col.bank'),
      cell: ({ getValue }) => <span className="text-sm">{getValue<string>() ?? '—'}</span>,
      size: 160,
    },
    {
      accessorKey: 'adapterType',
      header: t('admin.bankComms.col.channel'),
      cell: ({ row }) => (
        row.original.adapterType ? (
          <BankAdapterTypeBadge adapterType={row.original.adapterType} />
        ) : <span>—</span>
      ),
      size: 110,
    },
    {
      accessorKey: 'applicationId',
      header: t('admin.bankComms.col.app'),
      cell: ({ getValue }) => {
        const v = getValue<string | null>()
        return v ? <span className="font-mono text-xs text-brand-600">{v.slice(0, 8)}…</span> : <span>—</span>
      },
      size: 120,
    },
    {
      id: 'subjectOrEndpoint',
      header: t('admin.bankComms.col.subject'),
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-xs">
          {row.original.subject ?? row.original.endpoint ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('admin.bankComms.col.status'),
      cell: ({ getValue }) => <BankCommStatusBadge status={getValue<BankCommStatus>()} />,
      size: 130,
    },
    {
      accessorKey: 'messageId',
      header: t('admin.bankComms.col.messageId'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-[var(--text-tertiary)]">{(getValue<string>()).slice(0, 16)}…</span>
      ),
      size: 160,
    },
  ], [t])

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.bankComms.title')}
        subtitle={t('admin.bankComms.subtitle')}
      />

      {/* KPI strip */}
      <BankCommKpiStrip />

      {isError && (
        <AlertBanner
          type="error"
          title={t('admin.bankComms.loadError')}
          actions={
            <button type="button" onClick={() => void refetch()} className="text-xs underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {/* Filter bar */}
      <FilterBar align="center">
        <div className="flex-1 min-w-48">
          <Input
            type="search"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            placeholder={t('admin.bankComms.searchPlaceholder')}
            prefix={<Search className="h-4 w-4" />}
            size="sm"
          />
        </div>

        <NativeSelect
          label={t('admin.bankComms.filter.status')}
          value={filters.status}
          onChange={e => setFilter('status', e.target.value as BankCommStatus | '')}
          aria-label={t('admin.bankComms.filter.status')}
          className="min-w-[140px]"
        >
          <option value="">{t('admin.bankComms.filter.allStatuses')}</option>
          {(['QUEUED', 'SENT', 'DELIVERED', 'RESPONDED', 'BOUNCED', 'FAILED'] as BankCommStatus[]).map(s => (
            <option key={s} value={s}>{t(`admin.bankComms.status.${s.toLowerCase()}`)}</option>
          ))}
        </NativeSelect>

        <NativeSelect
          label={t('admin.bankComms.filter.direction')}
          value={filters.direction}
          onChange={e => setFilter('direction', e.target.value as 'outbound' | 'inbound' | '')}
          aria-label={t('admin.bankComms.filter.direction')}
          className="min-w-[140px]"
        >
          <option value="">{t('admin.bankComms.filter.allDirections')}</option>
          <option value="outbound">{t('admin.bankComms.direction.outbound')}</option>
          <option value="inbound">{t('admin.bankComms.direction.inbound')}</option>
        </NativeSelect>

        <NativeSelect
          label={t('admin.bankComms.filter.channel')}
          value={filters.channel}
          onChange={e => setFilter('channel', e.target.value as 'email' | 'rest' | 'oauth' | '')}
          aria-label={t('admin.bankComms.filter.channel')}
          className="min-w-[140px]"
        >
          <option value="">{t('admin.bankComms.filter.allChannels')}</option>
          <option value="email">Email</option>
          <option value="rest">REST</option>
          <option value="oauth">OAuth2</option>
        </NativeSelect>

        <NativeSelect
          label={t('admin.bankComms.filter.bank')}
          value={filters.bankId}
          onChange={e => setFilter('bankId', e.target.value)}
          aria-label={t('admin.bankComms.filter.bank')}
          className="min-w-[160px]"
        >
          <option value="">{t('admin.bankComms.filter.allBanks')}</option>
          {bankOptions.map(b => (
            <option key={b.bankId} value={b.bankId}>{b.name}</option>
          ))}
        </NativeSelect>

        <Input
          type="date"
          label={t('admin.bankComms.filter.from')}
          value={filters.from}
          onChange={e => setFilter('from', e.target.value)}
          size="sm"
          className="min-w-[150px]"
        />
        <Input
          type="date"
          label={t('admin.bankComms.filter.to')}
          value={filters.to}
          onChange={e => setFilter('to', e.target.value)}
          size="sm"
          className="min-w-[150px]"
        />

        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => void refetch()}
          className="self-end"
        >
          {t('common.refresh')}
        </Button>
      </FilterBar>

      {/* Bulk toolbar — export the filtered view + retry every failed message in it */}
      <div className="flex items-center justify-end gap-2">
        {failedInView.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RotateCw className="h-4 w-4" />}
            loading={bulkRetryMutation.isPending}
            onClick={() => void bulkRetryMutation.mutate()}
          >
            {t('admin.bankComms.retryAll', { count: failedInView.length })}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Download className="h-4 w-4" />}
          onClick={handleExport}
          disabled={filtered.length === 0}
        >
          {t('admin.bankComms.export')}
        </Button>
      </div>

      {/* SplitView */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Grid — 60% */}
        <div className="lg:col-span-3">
          <DataTable
            data={filtered}
            columns={columns}
            loading={isLoading}
            onRowClick={row => setSelected(row)}
            emptyState={
              <div className="py-14 text-center text-[var(--text-tertiary)]">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-[var(--text-disabled)]" aria-hidden="true" />
                {t('admin.bankComms.empty')}
              </div>
            }
            pageSize={50}
            tableId="bank-comms"
            density="compact"
          />
        </div>

        {/* Detail pane — 40% */}
        <div className="lg:col-span-2">
          <DetailPane
            message={selected}
            onResend={(m) => resendMutation.mutate(m)}
            resending={resendMutation.isPending}
          />
        </div>
      </div>
    </div>
  )
}
