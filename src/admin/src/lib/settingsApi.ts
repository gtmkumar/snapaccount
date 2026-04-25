/**
 * Settings API client — Phase 6F
 * Wires the 8 settings sections to their API endpoints.
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ── Notification preferences (uses NotificationService) ──────────────────────

export const NotificationPreferenceSchema = z.object({
  eventCode: z.string(),
  pushEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  doNotDisturb: z.boolean(),
})
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>

export const NotificationPreferencesSchema = z.object({
  items: z.array(NotificationPreferenceSchema),
})

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const res = await api.get('/notifications/preferences')
  return NotificationPreferencesSchema.parse(res.data).items
}

export async function upsertNotificationPreference(pref: NotificationPreference): Promise<void> {
  await api.put('/notifications/preferences', pref)
}

// ── Organisation settings (Auth service) ─────────────────────────────────────

export const OrgSettingsSchema = z.object({
  name: z.string().optional(),
  gstin: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
})
export type OrgSettings = z.infer<typeof OrgSettingsSchema>

export async function getOrgSettings(): Promise<OrgSettings> {
  const res = await api.get('/auth/org/settings')
  return OrgSettingsSchema.parse(res.data)
}

export async function updateOrgSettings(settings: Partial<OrgSettings>): Promise<void> {
  await api.patch('/auth/org/settings', settings)
}

// ── AI model configuration ────────────────────────────────────────────────────

export const AiConfigSchema = z.object({
  provider: z.string().optional(),
  modelId: z.string().optional(),
  ocrEnabled: z.boolean().optional(),
  autoClassifyEnabled: z.boolean().optional(),
  confidenceThreshold: z.number().optional(),
})
export type AiConfig = z.infer<typeof AiConfigSchema>

export async function getAiConfig(): Promise<AiConfig> {
  const res = await api.get('/auth/config/ai')
  return AiConfigSchema.parse(res.data)
}

export async function updateAiConfig(config: Partial<AiConfig>): Promise<void> {
  await api.patch('/auth/config/ai', config)
}

// ── Feature flags ─────────────────────────────────────────────────────────────

export const FeatureFlagsSchema = z.record(z.string(), z.boolean())
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const res = await api.get('/auth/feature-flags')
  return FeatureFlagsSchema.parse(res.data)
}

export async function updateFeatureFlag(flag: string, enabled: boolean): Promise<void> {
  await api.patch(`/auth/feature-flags/${flag}`, { enabled })
}

// ── Language / locale settings ────────────────────────────────────────────────

export const LanguageSettingsSchema = z.object({
  defaultLocale: z.string(),
  supportedLocales: z.array(z.string()),
  fallbackLocale: z.string(),
})
export type LanguageSettings = z.infer<typeof LanguageSettingsSchema>

export async function getLanguageSettings(): Promise<LanguageSettings> {
  const res = await api.get('/auth/config/language')
  return LanguageSettingsSchema.parse(res.data)
}

export async function updateLanguageSettings(settings: Partial<LanguageSettings>): Promise<void> {
  await api.patch('/auth/config/language', settings)
}

// ── WhatsApp config ──────────────────────────────────────────────────────────

export const WhatsAppConfigSchema = z.object({
  enabled: z.boolean(),
  wabaId: z.string().nullable().optional(),
  phoneNumberId: z.string().nullable().optional(),
  webhookVerifyToken: z.string().nullable().optional(),
})
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const res = await api.get('/auth/config/whatsapp')
  return WhatsAppConfigSchema.parse(res.data)
}

export async function updateWhatsAppConfig(config: Partial<WhatsAppConfig>): Promise<void> {
  await api.patch('/auth/config/whatsapp', config)
}

// ── User preferences (theme, etc.) ───────────────────────────────────────────

export async function updateUserPreferences(prefs: { theme?: string; locale?: string }): Promise<void> {
  await api.patch('/auth/me/preferences', prefs)
}
