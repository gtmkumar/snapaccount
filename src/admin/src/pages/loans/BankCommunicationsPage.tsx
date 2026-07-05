/**
 * BankCommunicationsPage — Phase 6C
 * Route: /loans/bank-communications
 * Cross-application audit log of all bank messages (email + REST + OAuth).
 * SplitView: DataGrid left, DetailPane right.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { Search, RefreshCw, MessageSquare } from 'lucide-react'
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
import { t } from '@/i18n'
import {
  listBankCommunications,
  getBankCommKpi,
  type BankCommMessage,
  type BankCommStatus,
} from '@/lib/loanApi'

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

function DetailPane({ message }: { message: BankCommMessage | null }) {
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
}

export default function BankCommunicationsPage() {
  const [selected, setSelected] = useState<BankCommMessage | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    direction: '',
    channel: '',
  })

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['bankCommunications', filters],
    queryFn: () =>
      listBankCommunications({
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.direction ? { direction: filters.direction } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.search ? { search: filters.search } : {}),
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
          <DetailPane message={selected} />
        </div>
      </div>
    </div>
  )
}
