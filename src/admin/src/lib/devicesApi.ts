/**
 * Devices / Sessions API client — Task #20 + GAP-047 device approval queue
 *
 * GET  /auth/devices                         — list all active devices
 * DELETE /auth/devices/{id}                  — revoke a device session
 * GET  /auth/devices/pending-approvals       — list pending approval requests (admin queue)
 * POST /auth/devices/{approvalId}/approve    — approve a pending request
 * POST /auth/devices/{approvalId}/deny       — deny a pending request
 */
import { z } from 'zod'
import api from './api'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const DeviceSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  deviceName: z.string().nullable().optional(),
  platform: z.string(),
  osVersion: z.string().nullable().optional(),
  appVersion: z.string().nullable().optional(),
  isActive: z.boolean(),
  lastActiveAt: z.string().nullable().optional(),
  boundAt: z.string(),
})
export type Device = z.infer<typeof DeviceSchema>

export const DeviceListSchema = z.array(DeviceSchema)

// GAP-047: Device approval queue schemas
// Matches DeviceApprovalDto from GetPendingApprovalQuery.cs
export const DeviceApprovalDtoSchema = z.object({
  approvalRequestId: z.string().uuid(),
  newDeviceId: z.string().uuid(),
  newDeviceIdentifier: z.string(),
  newDeviceName: z.string().nullable(),
  newDevicePlatform: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
})
export type DeviceApprovalDto = z.infer<typeof DeviceApprovalDtoSchema>

export const PendingApprovalsResponseSchema = z.object({
  pending: z.array(DeviceApprovalDtoSchema),
})
export type PendingApprovalsResponse = z.infer<typeof PendingApprovalsResponseSchema>

// Matches ApproveDeviceResponse from ApproveDeviceCommand.cs
export const ApproveDeviceResponseSchema = z.object({
  approvalRequestId: z.string().uuid(),
  status: z.string(),
  reviewedAt: z.string(),
})
export type ApproveDeviceResponse = z.infer<typeof ApproveDeviceResponseSchema>

// Matches DenyDeviceResponse from DenyDeviceCommand.cs
export const DenyDeviceResponseSchema = z.object({
  approvalRequestId: z.string().uuid(),
  status: z.string(),
  reviewedAt: z.string(),
  enforced: z.boolean(),
})
export type DenyDeviceResponse = z.infer<typeof DenyDeviceResponseSchema>

// ── API functions ──────────────────────────────────────────────────────────────

export async function getDevices(): Promise<Device[]> {
  const res = await api.get('/auth/devices')
  return DeviceListSchema.parse(res.data)
}

export async function revokeDevice(id: string): Promise<void> {
  await api.delete(`/auth/devices/${id}`)
}

// GAP-047: Get pending device approval requests for the current user
// GET /auth/devices/pending-approvals
export async function getPendingApprovals(): Promise<PendingApprovalsResponse> {
  const res = await api.get('/auth/devices/pending-approvals')
  return PendingApprovalsResponseSchema.parse(res.data)
}

// GAP-047: Approve a pending device login from an existing (reviewing) device
// POST /auth/devices/{approvalId}/approve
// Body: { reviewingDeviceEntityId: UUID }
export async function approveDevice(
  approvalId: string,
  reviewingDeviceEntityId: string,
): Promise<ApproveDeviceResponse> {
  const res = await api.post(`/auth/devices/${approvalId}/approve`, {
    reviewingDeviceEntityId,
  })
  return ApproveDeviceResponseSchema.parse(res.data)
}

// GAP-047: Deny a pending device login from an existing (reviewing) device
// POST /auth/devices/{approvalId}/deny
// Body: { reviewingDeviceEntityId: UUID, reason?: string }
export async function denyDevice(
  approvalId: string,
  reviewingDeviceEntityId: string,
  reason?: string,
): Promise<DenyDeviceResponse> {
  const res = await api.post(`/auth/devices/${approvalId}/deny`, {
    reviewingDeviceEntityId,
    ...(reason ? { reason } : {}),
  })
  return DenyDeviceResponseSchema.parse(res.data)
}
