/**
 * DevicesSettings — Task #20
 * Wired to GET /auth/devices + DELETE /auth/devices/{id}.
 * Shows a list of logged-in devices with a Revoke button per row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor, Smartphone, Tablet, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { getDevices, revokeDevice, type Device } from '@/lib/devicesApi'
import { t } from '@/i18n'
import { toast } from 'sonner'

function platformIcon(platform: string) {
  const p = platform.toLowerCase()
  if (p.includes('android') || p.includes('ios')) {
    return <Smartphone className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
  }
  if (p.includes('tablet') || p.includes('ipad')) {
    return <Tablet className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
  }
  return <Monitor className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function DeviceRow({ device, onRevoke, revoking }: {
  device: Device
  onRevoke: (id: string) => void
  revoking: boolean
}) {
  const name = device.deviceName ?? device.platform
  return (
    <div className="flex items-center gap-4 py-4 border-b border-[var(--border-subtle)] last:border-0">
      <div className="shrink-0">{platformIcon(device.platform)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{name}</span>
          {device.isActive && (
            <Badge variant="success">{t('devices.active')}</Badge>
          )}
        </div>
        <div className="text-xs text-[var(--text-tertiary)] mt-0.5 space-x-2">
          <span>{device.platform}</span>
          {device.osVersion && <span>• {device.osVersion}</span>}
          {device.appVersion && <span>• app {device.appVersion}</span>}
        </div>
        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
          {t('devices.lastActive')}: {formatDate(device.lastActiveAt)}
          {' · '}
          {t('devices.boundAt')}: {formatDate(device.boundAt)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRevoke(device.id)}
        loading={revoking}
        className="shrink-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
        aria-label={t('devices.revoke') + ' ' + name}
      >
        <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
        {t('devices.revoke')}
      </Button>
    </div>
  )
}

export function DevicesSettings() {
  const queryClient = useQueryClient()

  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
    staleTime: 30_000,
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: () => {
      toast.success(t('devices.revokeSuccess'))
      void queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: () => toast.error(t('devices.revokeError')),
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          {t('devices.title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {t('devices.subtitle')}
        </p>
      </div>

      <Card>
        {isLoading ? (
          <Skeleton variant="card" />
        ) : isError ? (
          <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
            {t('devices.loadError')}
          </div>
        ) : !devices?.length ? (
          <div className="py-12 text-center">
            <Monitor className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t('devices.empty')}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{t('devices.emptyDesc')}</p>
          </div>
        ) : (
          <div>
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                onRevoke={(id) => revokeMutation.mutate(id)}
                revoking={revokeMutation.isPending && revokeMutation.variables === device.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
