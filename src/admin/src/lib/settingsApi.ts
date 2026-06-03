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

export const ProviderKeyStatusSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  last4: z.string().nullable().optional(),
})
export type ProviderKeyStatus = z.infer<typeof ProviderKeyStatusSchema>

// Per-feature model/temperature override (keyed by feature name in featureModels).
export const FeatureModelSchema = z.object({
  model: z.string(),
  temperature: z.number(),
})
export type FeatureModel = z.infer<typeof FeatureModelSchema>

export const AiConfigSchema = z.object({
  provider: z.string().optional(),
  modelId: z.string().optional(),
  ocrTier: z.string().optional(),
  ocrEnabled: z.boolean().optional(),
  autoClassifyEnabled: z.boolean().optional(),
  confidenceThreshold: z.number().optional(),
  // Per-provider key STATUS (never the raw key).
  providerKeys: z.array(ProviderKeyStatusSchema).optional(),
  // Sarvam AI processing languages + per-feature model overrides (persisted).
  sarvamLanguages: z.array(z.string()).optional(),
  featureModels: z.record(z.string(), FeatureModelSchema).optional(),
})
export type AiConfig = z.infer<typeof AiConfigSchema>

/** Update payload: config fields + optional write-only provider keys (raw → encrypted server-side). */
export type AiConfigUpdate = Partial<Omit<AiConfig, 'providerKeys'>> & {
  providerKeys?: Record<string, string>
}

export async function getAiConfig(): Promise<AiConfig> {
  const res = await api.get('/auth/config/ai')
  return AiConfigSchema.parse(res.data)
}

export async function updateAiConfig(config: AiConfigUpdate): Promise<void> {
  await api.patch('/auth/config/ai', config)
}

// Real AI usage metrics (current month) — replaces the hardcoded metric cards.
export const ModelUsageSchema = z.object({
  provider: z.string(),
  model: z.string(),
  calls: z.number(),
  costUsd: z.number(),
})
export const AiUsageSchema = z.object({
  callsThisMonth: z.number(),
  estimatedCostUsd: z.number(),
  avgResponseMs: z.number(),
  byModel: z.array(ModelUsageSchema),
})
export type AiUsage = z.infer<typeof AiUsageSchema>

export async function getAiUsage(): Promise<AiUsage> {
  const res = await api.get('/auth/config/ai/usage')
  return AiUsageSchema.parse(res.data)
}

// Test the active (or given) provider's credentials — cheap auth check, no token cost.
export const AiTestResultSchema = z.object({
  ok: z.boolean(),
  provider: z.string(),
  message: z.string(),
})
export type AiTestResult = z.infer<typeof AiTestResultSchema>

export async function testAiConnection(provider?: string): Promise<AiTestResult> {
  const res = await api.post('/auth/config/ai/test', { provider })
  return AiTestResultSchema.parse(res.data)
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

// ── User preferences (theme, language, notifications) ────────────────────────

export const UserPreferencesSchema = z.object({
  preferredLanguage: z.string().optional(),
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  pushNotificationsEnabled: z.boolean().optional(),
  smsNotificationsEnabled: z.boolean().optional(),
  emailNotificationsEnabled: z.boolean().optional(),
  whatsappNotificationsEnabled: z.boolean().optional(),
})
export type UserPreferences = z.infer<typeof UserPreferencesSchema>

export async function getUserPreferences(): Promise<UserPreferences> {
  const res = await api.get('/auth/me/preferences')
  return UserPreferencesSchema.parse(res.data)
}

export async function updateUserPreferences(prefs: Partial<UserPreferences>): Promise<void> {
  await api.patch('/auth/me/preferences', prefs)
}

// ── 2FA / TOTP ────────────────────────────────────────────────────────────────

export const TwoFaStatusSchema = z.object({
  enabled: z.boolean(),
  confirmedAt: z.string().nullable().optional(),
})
export type TwoFaStatus = z.infer<typeof TwoFaStatusSchema>

export const TwoFaEnrollResponseSchema = z.object({
  otpauthUri: z.string(),
  base32Secret: z.string(),
})
export type TwoFaEnrollResponse = z.infer<typeof TwoFaEnrollResponseSchema>

export const TwoFaConfirmResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
})
export type TwoFaConfirmResponse = z.infer<typeof TwoFaConfirmResponseSchema>

export async function get2FaStatus(): Promise<TwoFaStatus> {
  const res = await api.get('/auth/me/2fa/status')
  return TwoFaStatusSchema.parse(res.data)
}

export async function enroll2Fa(): Promise<TwoFaEnrollResponse> {
  const res = await api.post('/auth/me/2fa/enroll')
  return TwoFaEnrollResponseSchema.parse(res.data)
}

export async function confirm2Fa(code: string): Promise<TwoFaConfirmResponse> {
  const res = await api.post('/auth/me/2fa/confirm', { code })
  return TwoFaConfirmResponseSchema.parse(res.data)
}

export async function disable2Fa(code: string): Promise<void> {
  await api.post('/auth/me/2fa/disable', { code })
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/password/forgot', { email })
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post('/auth/password/reset', { token, newPassword })
}
