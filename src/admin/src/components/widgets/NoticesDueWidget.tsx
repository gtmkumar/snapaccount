/**
 * NoticesDueWidget — GST notices due summary card for the dashboard.
 * Phase 6B — displayed in DashboardPage Row 4.
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Bell, AlertTriangle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { t } from '@/i18n'
import { getNoticesDueSummary } from '@/lib/gstApi'

export function NoticesDueWidget() {
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gst-notices-due-summary'],
    queryFn: getNoticesDueSummary,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const hasUrgent = (data?.overdue ?? 0) > 0 || (data?.dueIn2Days ?? 0) > 0

  return (
    <Card className="flex flex-col h-full">
      <CardHeader
        title={t('admin.gst.notice.widget.title')}
        actions={
          hasUrgent ? (
            <Badge variant="error">
              <AlertTriangle className="h-3 w-3 mr-0.5" aria-hidden="true" />
              {t('admin.gst.notice.widget.urgent')}
            </Badge>
          ) : (
            <Badge variant="gst">GST</Badge>
          )
        }
      />

      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-3 bg-[var(--surface-sunken)] rounded w-28" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded w-8" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--semantic-error-fg)]">{t('admin.gst.notice.widget.loadError')}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-[var(--text-secondary)]">
                {t('admin.gst.notice.widget.overdue')}
              </span>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${
                (data?.overdue ?? 0) > 0 ? 'text-error-600' : 'text-[var(--text-tertiary)]'
              }`}>
                {data?.overdue ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-[var(--text-secondary)]">
                {t('admin.gst.notice.widget.dueIn2Days')}
              </span>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${
                (data?.dueIn2Days ?? 0) > 0 ? 'text-warning-600' : 'text-[var(--text-tertiary)]'
              }`}>
                {data?.dueIn2Days ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-[var(--text-secondary)]">
                {t('admin.gst.notice.widget.dueThisWeek')}
              </span>
              <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)] shrink-0">
                {data?.dueThisWeek ?? 0}
              </span>
            </div>
          </div>
        )}
      </div>

      <Button
        variant="primary"
        size="sm"
        fullWidth
        className="mt-4"
        leftIcon={<Bell className="h-3.5 w-3.5" />}
        onClick={() => void navigate('/gst/notices')}
      >
        {t('admin.gst.notice.widget.cta')}
      </Button>
    </Card>
  )
}
