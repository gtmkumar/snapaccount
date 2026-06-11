/**
 * SystemHealthPage — Standalone system health monitor
 * Route: /admin/system-health
 * GAP-038 / GAP-052: Replace hardcoded dashboard widget with real health data.
 *
 * Data source: getAggregateHealth() from healthApi.ts
 * - Tries GET /admin/health/aggregate (devops monitoring proxy, not yet deployed)
 * - Falls back to probing each service's /health/{name} via the gateway
 * - Shows "monitoring proxy not deployed" state clearly when neither is available
 *
 * Auto-refreshes every 30s. Permission: dashboard.system_health (SUPER_ADMIN only).
 */
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw,
  Activity, Server,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Can } from '@/components/shared/Can'
import { EmptyState } from '@/components/ui/EmptyState'
import { getAggregateHealth, type ServiceHealth, type ServiceHealthStatus } from '@/lib/healthApi'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ServiceHealthStatus, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  label: string
}> = {
  healthy: {
    icon: CheckCircle2,
    color: 'text-[var(--semantic-success-fg)]',
    bgColor: 'bg-[var(--semantic-success-bg)]',
    label: 'health.status.healthy',
  },
  degraded: {
    icon: AlertTriangle,
    color: 'text-[var(--semantic-warning-fg)]',
    bgColor: 'bg-[var(--semantic-warning-bg)]',
    label: 'health.status.degraded',
  },
  down: {
    icon: XCircle,
    color: 'text-[var(--semantic-error-fg)]',
    bgColor: 'bg-[var(--semantic-error-bg)]',
    label: 'health.status.down',
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-[var(--text-disabled)]',
    bgColor: 'bg-[var(--surface-sunken)]',
    label: 'health.status.unknown',
  },
}

function StatusIcon({ status, className }: { status: ServiceHealthStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status]
  return <cfg.icon className={cn(cfg.color, className)} />
}

function StatusBadge({ status }: { status: ServiceHealthStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
      cfg.bgColor, cfg.color
    )}>
      <cfg.icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(cfg.label)}
    </span>
  )
}

// ── Service row ───────────────────────────────────────────────────────────────

function ServiceRow({ svc }: { svc: ServiceHealth }) {
  const name = svc.name.replace(/-service$/, '').replace(/-/g, ' ')
  const displayName = name.charAt(0).toUpperCase() + name.slice(1)

  return (
    <div className="flex items-center justify-between py-3 px-4">
      <div className="flex items-center gap-3 min-w-0">
        <StatusIcon status={svc.status} className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] capitalize">{displayName}</p>
          <p className="text-xs font-mono text-[var(--text-tertiary)]">{svc.name}</p>
          {svc.detail && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate max-w-xs" title={svc.detail}>
              {svc.detail}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {svc.responseMs != null ? (
          <span className={cn(
            'text-sm tabular-nums font-medium',
            svc.responseMs < 200 ? 'text-[var(--semantic-success-fg)]'
            : svc.responseMs < 500 ? 'text-[var(--semantic-warning-fg)]'
            : 'text-[var(--semantic-error-fg)]'
          )}>
            {svc.responseMs}ms
          </span>
        ) : (
          <span className="text-sm text-[var(--text-disabled)]">—</span>
        )}
        <StatusBadge status={svc.status} />
      </div>
    </div>
  )
}

// ── Overall banner ────────────────────────────────────────────────────────────

function OverallBanner({ status, checkedAt }: { status: ServiceHealthStatus; checkedAt: string }) {
  const isAllUnknown = status === 'unknown'

  if (isAllUnknown) {
    return (
      <AlertBanner
        type="warning"
        title={t('health.proxyMissing.title')}
        description={t('health.proxyMissing.body')}
      />
    )
  }

  const type = status === 'healthy' ? 'success' : status === 'down' ? 'error' : 'warning'
  const title = t(`health.overall.${status}`)
  const checked = new Date(checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <AlertBanner
      type={type}
      title={title}
      description={t('health.lastChecked', { time: checked })}
    />
  )
}

// ── Summary KPI cards ─────────────────────────────────────────────────────────

function SummaryStrip({ services }: { services: ServiceHealth[] }) {
  const healthy = services.filter(s => s.status === 'healthy').length
  const degraded = services.filter(s => s.status === 'degraded').length
  const down = services.filter(s => s.status === 'down').length
  const unknown = services.filter(s => s.status === 'unknown').length
  const avgMs = services
    .filter(s => s.responseMs != null)
    .reduce((sum, s, _, arr) => sum + (s.responseMs! / arr.length), 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: t('health.kpi.healthy'), value: `${healthy}/${services.length}`, icon: CheckCircle2, color: 'bg-[var(--semantic-success-bg)] text-[var(--semantic-success-fg)]' },
        { label: t('health.kpi.degraded'), value: String(degraded), icon: AlertTriangle, color: 'bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-fg)]' },
        { label: t('health.kpi.down'), value: String(down), icon: XCircle, color: 'bg-[var(--semantic-error-bg)] text-[var(--semantic-error-fg)]' },
        { label: t('health.kpi.avgResponse'), value: avgMs > 0 ? `${Math.round(avgMs)}ms` : t('health.kpi.noData'), icon: Activity, color: 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400' },
      ].map(k => (
        <Card key={k.label} className="flex items-center gap-4">
          <div className={cn('p-3 rounded-xl', k.color)}>
            <k.icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">{k.label}</p>
            <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{k.value}</p>
          </div>
        </Card>
      ))}
      {unknown > 0 && (
        <p className="col-span-full text-xs text-[var(--text-tertiary)]">
          {t('health.kpi.unknownNote', { count: unknown })}
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: getAggregateHealth,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ['system', 'health'] })
    }, 30_000)
    return () => clearInterval(id)
  }, [queryClient])

  const services = data?.services ?? []
  const lastRefresh = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-IN')
    : null

  return (
    <Can permission="admin.dashboard.read" fallback={
      <EmptyState variant="generic" title={t('common.forbidden')} size="md" />
    }>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <PageHeader
            title={t('health.page.title')}
            subtitle={t('health.page.subtitle')}
          />
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {t('health.lastChecked', { time: lastRefresh })}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void refetch()}
              disabled={isLoading}
            >
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {isError && (
          <AlertBanner
            type="error"
            title={t('health.error.title')}
            description={t('health.error.body')}
          />
        )}

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="card" />)}
            </div>
            <Skeleton variant="list" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            <OverallBanner status={data.overall} checkedAt={data.checkedAt} />

            <SummaryStrip services={services} />

            <Card padding="none">
              <div className="px-4 pt-4 pb-2">
                <CardHeader
                  title={t('health.services.title')}
                  subtitle={t('health.services.subtitle', { count: services.length })}
                  actions={
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-[var(--text-disabled)]" aria-hidden="true" />
                    </div>
                  }
                />
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {services.map(svc => (
                  <ServiceRow key={svc.name} svc={svc} />
                ))}
              </div>
            </Card>

            {services.every(s => s.status === 'unknown') && (
              <Card>
                <CardHeader title={t('health.setup.title')} />
                <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                  <p>{t('health.setup.body1')}</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs font-mono bg-[var(--surface-sunken)] p-3 rounded-lg">
                    <li>GET /admin/health/aggregate — devops monitoring proxy (GAP-052)</li>
                    <li>GET /health/&#123;service-name&#125; — per-service gateway routes</li>
                  </ol>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('health.setup.body2')}</p>
                </div>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </Can>
  )
}
