/**
 * Health check API — GAP-038 / GAP-052
 * Probes each backend service's /healthz endpoint and returns aggregated status.
 *
 * NOTE: VITE_API_BASE_URL points to the API gateway / Aspire aggregation layer.
 * Individual service healthz probes are sent via the gateway if routed, or
 * directly to service-specific ports in local dev.
 *
 * When a devops monitoring proxy is available (GAP-052 open item), replace
 * the per-service probes with a single GET /admin/health/aggregate call.
 */
import { z } from 'zod'
import axios from 'axios'
import api from './api'

// ── Schemas ───────────────────────────────────────────────────────────────────

export const ServiceHealthStatus = z.enum(['healthy', 'degraded', 'down', 'unknown'])
export type ServiceHealthStatus = z.infer<typeof ServiceHealthStatus>

export const ServiceHealthSchema = z.object({
  name: z.string(),
  status: ServiceHealthStatus,
  responseMs: z.number().nullable(),
  checkedAt: z.string(),
  detail: z.string().nullable().optional(),
})
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>

export const AggregateHealthSchema = z.object({
  overall: ServiceHealthStatus,
  services: z.array(ServiceHealthSchema),
  checkedAt: z.string(),
})
export type AggregateHealth = z.infer<typeof AggregateHealthSchema>

// ── Service definitions ───────────────────────────────────────────────────────

/** Known service names — matches Aspire composite service references. */
export const KNOWN_SERVICES = [
  'api-gateway',
  'platform-service',
  'finance-service',
  'assist-service',
] as const

export type KnownService = (typeof KNOWN_SERVICES)[number]

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Probe a single service healthz endpoint via the API gateway.
 * Route pattern: GET /health/{serviceName} — requires a gateway route or proxy.
 *
 * Falls back to a synthetic "unknown" status when the proxy route 404s
 * (i.e., the devops monitoring proxy has not been deployed yet — GAP-052).
 */
async function probeService(name: string): Promise<ServiceHealth> {
  const start = Date.now()
  const checkedAt = new Date().toISOString()
  try {
    await api.get(`/health/${name}`, { timeout: 5_000 })
    return ServiceHealthSchema.parse({
      name,
      status: 'healthy',
      responseMs: Date.now() - start,
      checkedAt,
    })
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    const responseMs = Date.now() - start

    if (status === 404 || status === 501) {
      // Gateway route not yet deployed — report unknown
      return ServiceHealthSchema.parse({
        name,
        status: 'unknown',
        responseMs: null,
        checkedAt,
        detail: 'Monitoring proxy not deployed (GAP-052). Install devops proxy or Aspire dashboard.',
      })
    }

    if (axios.isAxiosError(err) && !err.response) {
      // Network error — service unreachable
      return ServiceHealthSchema.parse({
        name,
        status: 'down',
        responseMs,
        checkedAt,
        detail: err.message,
      })
    }

    // 5xx — degraded
    return ServiceHealthSchema.parse({
      name,
      status: status && status >= 500 ? 'down' : 'degraded',
      responseMs,
      checkedAt,
      detail: `HTTP ${status ?? 'error'}`,
    })
  }
}

/**
 * Probe all known services in parallel and aggregate results.
 * Uses a monitoring proxy endpoint if available (GET /admin/health/aggregate),
 * falling back to per-service probes.
 */
export async function getAggregateHealth(): Promise<AggregateHealth> {
  // Try the aggregate endpoint first (composite architecture exposes this on Platform).
  try {
    const res = await api.get('/admin/health/aggregate', { timeout: 8_000 })
    return AggregateHealthSchema.parse(res.data)
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    // Auth failures must not fall through to per-service probes (those routes 404 on the gateway).
    if (status === 401 || status === 403) throw err
    // Proxy not available — fan out per-service probes
  }

  const results = await Promise.all(
    KNOWN_SERVICES.map(name => probeService(name))
  )

  const statuses = results.map(r => r.status)
  const overall: ServiceHealthStatus =
    statuses.every(s => s === 'healthy')
      ? 'healthy'
      : statuses.some(s => s === 'down')
      ? 'down'
      : statuses.some(s => s === 'degraded')
      ? 'degraded'
      : 'unknown'

  return AggregateHealthSchema.parse({
    overall,
    services: results,
    checkedAt: new Date().toISOString(),
  })
}
