/**
 * DeviceApprovalQueue — GAP-047 / BUG-W7-06
 *
 * Admin view of pending new-device approval requests.
 * Wired to:
 *   GET  /auth/devices/pending-approvals       — list pending requests
 *   GET  /auth/devices                         — list reviewer's own devices (to pick reviewing device)
 *   POST /auth/devices/{approvalId}/approve    — approve a request
 *   POST /auth/devices/{approvalId}/deny       — deny a request (with optional reason)
 *
 * Soft-launch note: DeviceApproval:Enforce may be false (NOTIFY_ONLY mode); the UI
 * renders the same approve/deny actions — enforcement is a backend config concern.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, ShieldX, Smartphone, Monitor, Tablet, Clock, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  getPendingApprovals,
  approveDevice,
  denyDevice,
  getDevices,
  type DeviceApprovalDto,
  type Device,
} from '@/lib/devicesApi'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function platformIcon(platform: string) {
  const p = platform.toLowerCase()
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) {
    return <Smartphone className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
  }
  if (p.includes('tablet') || p.includes('ipad')) {
    return <Tablet className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
  }
  return <Monitor className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
}

function formatDateIST(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date()
}

// ── Deny Reason Modal ─────────────────────────────────────────────────────────

interface DenyModalProps {
  request: DeviceApprovalDto
  reviewerDevices: Device[]
  onConfirm: (reviewingDeviceEntityId: string, reason: string | undefined) => void
  onCancel: () => void
  isPending: boolean
}

function DenyModal({ request, reviewerDevices, onConfirm, onCancel, isPending }: DenyModalProps) {
  const [reason, setReason] = useState('')
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    reviewerDevices.find(d => d.isActive)?.id ?? '',
  )

  const deviceName = request.newDeviceName ?? request.newDevicePlatform

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('deviceApproval.deny.dialogLabel')}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-error-50 p-2">
            <ShieldX className="h-5 w-5 text-error-600" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {t('deviceApproval.deny.title')}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {t('deviceApproval.deny.deviceLabel')}: <strong>{deviceName}</strong>
            </p>
          </div>
        </div>

        {reviewerDevices.length > 1 && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-primary)]" htmlFor="denyReviewer">
              {t('deviceApproval.reviewingDevice.label')}
            </label>
            <select
              id="denyReviewer"
              value={selectedDeviceId}
              onChange={e => setSelectedDeviceId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm bg-white text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {reviewerDevices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.deviceName ?? d.platform} {d.isActive ? `(${t('deviceApproval.reviewingDevice.current')})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-primary)]" htmlFor="denyReason">
            {t('deviceApproval.deny.reasonLabel')}
            <span className="text-[var(--text-tertiary)] font-normal ml-1">
              ({t('deviceApproval.deny.reasonOptional')})
            </span>
          </label>
          <textarea
            id="denyReason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('deviceApproval.deny.reasonPlaceholder')}
            className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm bg-white text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <p className="text-xs text-[var(--text-tertiary)] text-right">{reason.length}/500</p>
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onConfirm(selectedDeviceId, reason.trim() || undefined)}
            loading={isPending}
            disabled={!selectedDeviceId || isPending}
          >
            <ShieldX className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t('deviceApproval.deny.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Approve Modal ─────────────────────────────────────────────────────────────

interface ApproveModalProps {
  request: DeviceApprovalDto
  reviewerDevices: Device[]
  onConfirm: (reviewingDeviceEntityId: string) => void
  onCancel: () => void
  isPending: boolean
}

function ApproveModal({ request, reviewerDevices, onConfirm, onCancel, isPending }: ApproveModalProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    reviewerDevices.find(d => d.isActive)?.id ?? '',
  )

  const deviceName = request.newDeviceName ?? request.newDevicePlatform

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={t('deviceApproval.approve.dialogLabel')}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-success-50 p-2">
            <ShieldCheck className="h-5 w-5 text-success-600" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {t('deviceApproval.approve.title')}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {t('deviceApproval.approve.deviceLabel')}: <strong>{deviceName}</strong>
            </p>
          </div>
        </div>

        {reviewerDevices.length > 1 && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--text-primary)]" htmlFor="approveReviewer">
              {t('deviceApproval.reviewingDevice.label')}
            </label>
            <select
              id="approveReviewer"
              value={selectedDeviceId}
              onChange={e => setSelectedDeviceId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm bg-white text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {reviewerDevices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.deviceName ?? d.platform} {d.isActive ? `(${t('deviceApproval.reviewingDevice.current')})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-sm text-[var(--text-secondary)] bg-warning-50 rounded-lg px-3 py-2 border border-warning-200">
          {t('deviceApproval.approve.warning')}
        </p>

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={() => onConfirm(selectedDeviceId)}
            loading={isPending}
            disabled={!selectedDeviceId || isPending}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t('deviceApproval.approve.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Approval Request Row ───────────────────────────────────────────────────────

interface ApprovalRowProps {
  request: DeviceApprovalDto
  reviewerDevices: Device[]
  onApprove: (approvalId: string, reviewingDeviceEntityId: string) => void
  onDeny: (approvalId: string, reviewingDeviceEntityId: string, reason?: string) => void
  approvePending: boolean
  denyPending: boolean
  pendingId: string | null
}

function ApprovalRow({
  request,
  reviewerDevices,
  onApprove,
  onDeny,
  approvePending,
  denyPending,
  pendingId,
}: ApprovalRowProps) {
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showDenyModal, setShowDenyModal] = useState(false)

  const expired = isExpired(request.expiresAt)
  const deviceName = request.newDeviceName ?? request.newDevicePlatform
  const isThisActionPending = pendingId === request.approvalRequestId
  const actionsDisabled = expired || approvePending || denyPending

  return (
    <>
      <div
        className={cn(
          'flex items-start gap-4 py-4 border-b border-[var(--border-subtle)] last:border-0',
          expired && 'opacity-60',
        )}
      >
        <div className="shrink-0 mt-0.5">{platformIcon(request.newDevicePlatform)}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
              {deviceName}
            </span>
            {expired ? (
              <Badge variant="neutral">{t('deviceApproval.status.expired')}</Badge>
            ) : (
              <Badge variant="warning">{t('deviceApproval.status.pending')}</Badge>
            )}
          </div>

          <div className="text-xs text-[var(--text-tertiary)] mt-0.5 space-x-2">
            <span>{request.newDevicePlatform}</span>
            {request.newDeviceIdentifier && (
              <span>· {request.newDeviceIdentifier}</span>
            )}
          </div>

          <div className="text-xs text-[var(--text-tertiary)] mt-1 space-y-0.5">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {t('deviceApproval.requestedAt')}: {formatDateIST(request.createdAt)}
              </span>
            </div>
            <div
              className={cn(
                'flex items-center gap-1',
                expired ? 'text-error-500' : 'text-warning-600',
              )}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {expired
                  ? t('deviceApproval.expiredAt')
                  : t('deviceApproval.expiresAt')}
                : {formatDateIST(request.expiresAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0 self-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDenyModal(true)}
            disabled={actionsDisabled}
            loading={isThisActionPending && denyPending}
            className="text-error-600 hover:text-error-700 hover:bg-error-50"
            aria-label={`${t('deviceApproval.deny.action')} ${deviceName}`}
          >
            <ShieldX className="h-4 w-4 mr-1" aria-hidden="true" />
            {t('deviceApproval.deny.action')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowApproveModal(true)}
            disabled={actionsDisabled}
            loading={isThisActionPending && approvePending}
            className="text-success-700 hover:text-success-800 hover:bg-success-50"
            aria-label={`${t('deviceApproval.approve.action')} ${deviceName}`}
          >
            <ShieldCheck className="h-4 w-4 mr-1" aria-hidden="true" />
            {t('deviceApproval.approve.action')}
          </Button>
        </div>
      </div>

      {showApproveModal && (
        <ApproveModal
          request={request}
          reviewerDevices={reviewerDevices}
          onConfirm={(deviceId) => {
            setShowApproveModal(false)
            onApprove(request.approvalRequestId, deviceId)
          }}
          onCancel={() => setShowApproveModal(false)}
          isPending={isThisActionPending && approvePending}
        />
      )}

      {showDenyModal && (
        <DenyModal
          request={request}
          reviewerDevices={reviewerDevices}
          onConfirm={(deviceId, reason) => {
            setShowDenyModal(false)
            onDeny(request.approvalRequestId, deviceId, reason)
          }}
          onCancel={() => setShowDenyModal(false)}
          isPending={isThisActionPending && denyPending}
        />
      )}
    </>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function DeviceApprovalQueue() {
  const queryClient = useQueryClient()
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null)
  const [pendingDenyId, setPendingDenyId] = useState<string | null>(null)

  const {
    data: approvalsData,
    isLoading: approvalsLoading,
    isError: approvalsError,
    refetch,
  } = useQuery({
    queryKey: ['deviceApprovals', 'pending'],
    queryFn: getPendingApprovals,
    staleTime: 15_000,
    refetchInterval: 30_000, // auto-refresh every 30s since requests expire in 10min
  })

  // Fetch reviewer's own devices so the UI can let admin pick the reviewing device
  const { data: myDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
    staleTime: 60_000,
  })

  const reviewerDevices = myDevices?.filter(d => d.isActive) ?? []

  const approveMutation = useMutation({
    mutationFn: ({ approvalId, reviewingDeviceEntityId }: {
      approvalId: string
      reviewingDeviceEntityId: string
    }) => approveDevice(approvalId, reviewingDeviceEntityId),
    onMutate: ({ approvalId }) => setPendingApproveId(approvalId),
    onSuccess: () => {
      toast.success(t('deviceApproval.approve.success'))
      void queryClient.invalidateQueries({ queryKey: ['deviceApprovals', 'pending'] })
    },
    onError: () => toast.error(t('deviceApproval.approve.error')),
    onSettled: () => setPendingApproveId(null),
  })

  const denyMutation = useMutation({
    mutationFn: ({ approvalId, reviewingDeviceEntityId, reason }: {
      approvalId: string
      reviewingDeviceEntityId: string
      reason?: string
    }) => denyDevice(approvalId, reviewingDeviceEntityId, reason),
    onMutate: ({ approvalId }) => setPendingDenyId(approvalId),
    onSuccess: () => {
      toast.success(t('deviceApproval.deny.success'))
      void queryClient.invalidateQueries({ queryKey: ['deviceApprovals', 'pending'] })
    },
    onError: () => toast.error(t('deviceApproval.deny.error')),
    onSettled: () => setPendingDenyId(null),
  })

  const pending = approvalsData?.pending ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('deviceApproval.title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('deviceApproval.subtitle')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          disabled={approvalsLoading}
          aria-label={t('deviceApproval.refresh')}
        >
          <RefreshCw className={cn('h-4 w-4 mr-1.5', approvalsLoading && 'animate-spin')} aria-hidden="true" />
          {t('deviceApproval.refresh')}
        </Button>
      </div>

      <Card>
        {approvalsLoading ? (
          <div className="space-y-4 p-2">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        ) : approvalsError ? (
          <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
            {t('deviceApproval.loadError')}
          </div>
        ) : pending.length === 0 ? (
          <div className="py-12 text-center">
            <ShieldCheck className="h-10 w-10 text-success-500 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t('deviceApproval.empty')}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {t('deviceApproval.emptyDesc')}
            </p>
          </div>
        ) : (
          <div>
            {pending.map((request) => (
              <ApprovalRow
                key={request.approvalRequestId}
                request={request}
                reviewerDevices={reviewerDevices}
                onApprove={(approvalId, reviewingDeviceEntityId) =>
                  approveMutation.mutate({ approvalId, reviewingDeviceEntityId })
                }
                onDeny={(approvalId, reviewingDeviceEntityId, reason) =>
                  denyMutation.mutate({ approvalId, reviewingDeviceEntityId, reason })
                }
                approvePending={approveMutation.isPending}
                denyPending={denyMutation.isPending}
                pendingId={pendingApproveId ?? pendingDenyId}
              />
            ))}
          </div>
        )}
      </Card>

      {reviewerDevices.length === 0 && !approvalsLoading && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          {t('deviceApproval.noReviewerDevice')}
        </div>
      )}
    </div>
  )
}
