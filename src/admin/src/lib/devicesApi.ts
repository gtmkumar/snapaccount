/**
 * Devices / Sessions API client — Task #20
 * GET /auth/devices         — list all active devices
 * DELETE /auth/devices/{id} — revoke a device session
 */
import { z } from 'zod'
import api from './api'

// ── Zod schema ────────────────────────────────────────────────────────────────

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

// ── API functions ──────────────────────────────────────────────────────────────

export async function getDevices(): Promise<Device[]> {
  const res = await api.get('/auth/devices')
  return DeviceListSchema.parse(res.data)
}

export async function revokeDevice(id: string): Promise<void> {
  await api.delete(`/auth/devices/${id}`)
}
