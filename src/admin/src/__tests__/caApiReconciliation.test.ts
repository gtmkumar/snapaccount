/**
 * caApi — Wave 7A reconciliation tests
 *
 * Covers:
 * - listCaProfiles: maps GET /appointments/ca-profiles response (caProfileId → caId)
 * - listAvailabilityRules: maps AvailabilityRuleDto (int weekday, TimeSpan) to frontend shape
 * - createAvailabilityRule: serialises frontend form (Weekday string, "HH:mm") to backend body
 * - deleteAvailabilityRule: DELETE /appointments/availability-rules/{id}
 * - generateSlotsFromRules: POST /appointments/availability-rules/generate
 * - cancelAppointmentAsCA: POST /appointments/{id}/cancel-by-ca { reason }
 * - Weekday ↔ .NET DayOfWeek int conversion (0=Sun, 1=Mon, …, 6=Sat)
 * - TimeSpan "HH:MM:SS" ↔ "HH:mm" conversion (round-trip)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/lib/api'
import {
  listCaProfiles,
  listAvailabilityRules,
  createAvailabilityRule,
  deleteAvailabilityRule,
  generateSlotsFromRules,
  cancelAppointmentAsCA,
} from '@/lib/caApi'

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// listCaProfiles
// ---------------------------------------------------------------------------

describe('listCaProfiles', () => {
  // Valid RFC 4122 v4 UUIDs
  const CA_PROFILE_UUID = '550e8400-e29b-41d4-a716-446655440001'
  const USER_UUID = '550e8400-e29b-41d4-a716-446655440002'

  it('calls GET /appointments/ca-profiles and maps caProfileId → caId', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            caProfileId: CA_PROFILE_UUID,
            userId: USER_UUID,
            displayName: 'Priya Sharma',
            bio: 'GST specialist',
            specialisations: 'GST, ITR',
            averageRating: 4.5,
            ratingCount: 12,
            isActive: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 100,
      },
    })

    const profiles = await listCaProfiles()

    expect(mockedApi.get).toHaveBeenCalledWith('/appointments/ca-profiles', {
      params: { activeOnly: true, pageSize: 100 },
    })
    expect(profiles).toHaveLength(1)
    expect(profiles[0].caId).toBe(CA_PROFILE_UUID)
    expect(profiles[0].userId).toBe(USER_UUID)
    expect(profiles[0].displayName).toBe('Priya Sharma')
    expect(profiles[0].averageRating).toBe(4.5)
    expect(profiles[0].isActive).toBe(true)
  })

  it('passes activeOnly=false when specified', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [], totalCount: 0, page: 1, pageSize: 100 } })
    await listCaProfiles(false)
    expect(mockedApi.get).toHaveBeenCalledWith('/appointments/ca-profiles', {
      params: { activeOnly: false, pageSize: 100 },
    })
  })
})

// ---------------------------------------------------------------------------
// listAvailabilityRules
// ---------------------------------------------------------------------------

describe('listAvailabilityRules', () => {
  const RULE_UUID = '550e8400-e29b-41d4-a716-446655440010'
  const CA_UUID = '550e8400-e29b-41d4-a716-446655440011'

  const makeDtoRule = (weekday: number, start: string, end: string) => ({
    ruleId: RULE_UUID,
    caProfileId: CA_UUID,
    weekday,
    startTimeIst: start,
    endTimeIst: end,
    slotDurationMinutes: 30,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
  })

  it('calls GET /appointments/availability-rules with caProfileId and maps response', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: { items: [makeDtoRule(1, '09:00:00', '17:00:00')] }, // weekday=1 → MONDAY
    })

    const rules = await listAvailabilityRules(CA_UUID, true)

    expect(mockedApi.get).toHaveBeenCalledWith('/appointments/availability-rules', {
      params: { activeOnly: true, caProfileId: CA_UUID },
    })
    expect(rules).toHaveLength(1)
    expect(rules[0].id).toBe(RULE_UUID)
    expect(rules[0].caId).toBe(CA_UUID)
    expect(rules[0].weekday).toBe('MONDAY')
    expect(rules[0].startTime).toBe('09:00')
    expect(rules[0].endTime).toBe('17:00')
    expect(rules[0].active).toBe(true)
  })

  it('maps .NET DayOfWeek 0=Sunday', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [makeDtoRule(0, '10:00:00', '12:00:00')] } })
    const rules = await listAvailabilityRules()
    expect(rules[0].weekday).toBe('SUNDAY')
  })

  it('maps .NET DayOfWeek 6=Saturday', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [makeDtoRule(6, '10:00:00', '12:00:00')] } })
    const rules = await listAvailabilityRules()
    expect(rules[0].weekday).toBe('SATURDAY')
  })

  it('strips seconds from TimeSpan e.g. "09:30:00" → "09:30"', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [makeDtoRule(2, '09:30:00', '13:45:00')] } })
    const rules = await listAvailabilityRules()
    expect(rules[0].startTime).toBe('09:30')
    expect(rules[0].endTime).toBe('13:45')
  })

  it('handles single-digit hour TimeSpan "9:00:00" → "09:00"', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [makeDtoRule(3, '9:00:00', '17:00:00')] } })
    const rules = await listAvailabilityRules()
    expect(rules[0].startTime).toBe('09:00')
  })

  it('omits caProfileId param when not provided', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [] } })
    await listAvailabilityRules(undefined, true)
    const callParams = mockedApi.get.mock.calls[0][1].params
    expect(callParams).not.toHaveProperty('caProfileId')
  })
})

// ---------------------------------------------------------------------------
// createAvailabilityRule
// ---------------------------------------------------------------------------

describe('createAvailabilityRule', () => {
  const NEW_RULE_UUID = '550e8400-e29b-41d4-a716-446655440020'
  const CA_UUID = '550e8400-e29b-41d4-a716-446655440021'

  const makeRuleResponseDto = (weekday = 1) => ({
    ruleId: NEW_RULE_UUID,
    caProfileId: CA_UUID,
    weekday,
    startTimeIst: '09:00:00',
    endTimeIst: '17:00:00',
    slotDurationMinutes: 30,
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
  })

  it('converts Weekday string → .NET DayOfWeek int in POST body', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: makeRuleResponseDto(1) })

    await createAvailabilityRule({
      weekday: 'MONDAY',
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 30,
    })

    const body = mockedApi.post.mock.calls[0][1]
    expect(mockedApi.post).toHaveBeenCalledWith('/appointments/availability-rules', expect.any(Object))
    expect(body.weekday).toBe(1)           // MONDAY → 1
    expect(body.startTimeIst).toBe('09:00:00')
    expect(body.endTimeIst).toBe('17:00:00')
    expect(body.slotDurationMinutes).toBe(30)
  })

  it('converts SUNDAY → 0', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: makeRuleResponseDto(0) })
    await createAvailabilityRule({ weekday: 'SUNDAY', startTime: '10:00', endTime: '12:00', slotDurationMinutes: 60 })
    expect(mockedApi.post.mock.calls[0][1].weekday).toBe(0)
  })

  it('converts SATURDAY → 6', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: makeRuleResponseDto(6) })
    await createAvailabilityRule({ weekday: 'SATURDAY', startTime: '10:00', endTime: '14:00', slotDurationMinutes: 45 })
    expect(mockedApi.post.mock.calls[0][1].weekday).toBe(6)
  })

  it('pads "HH:mm" to "HH:MM:00" for TimeSpan', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: makeRuleResponseDto(2) })
    await createAvailabilityRule({ weekday: 'TUESDAY', startTime: '08:30', endTime: '16:00', slotDurationMinutes: 30 })
    const body = mockedApi.post.mock.calls[0][1]
    expect(body.startTimeIst).toBe('08:30:00')
    expect(body.endTimeIst).toBe('16:00:00')
  })

  it('returns normalised AvailabilityRule (frontend shape)', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: makeRuleResponseDto(3) })
    const rule = await createAvailabilityRule({ weekday: 'WEDNESDAY', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 })
    expect(rule.weekday).toBe('WEDNESDAY')
    expect(rule.startTime).toBe('09:00')
    expect(rule.active).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// deleteAvailabilityRule
// ---------------------------------------------------------------------------

describe('deleteAvailabilityRule', () => {
  it('calls DELETE /appointments/availability-rules/{id}', async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: { ruleId: 'rule-uuid-1', deleted: true } })
    await deleteAvailabilityRule('rule-uuid-1')
    expect(mockedApi.delete).toHaveBeenCalledWith('/appointments/availability-rules/rule-uuid-1')
  })
})

// ---------------------------------------------------------------------------
// generateSlotsFromRules
// ---------------------------------------------------------------------------

describe('generateSlotsFromRules', () => {
  const CA_UUID = '550e8400-e29b-41d4-a716-446655440030'

  it('calls POST /appointments/availability-rules/generate with defaults', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { caProfileId: CA_UUID, rulesProcessed: 2, slotsCreated: 14, slotsSkipped: 3 },
    })

    const result = await generateSlotsFromRules({ caProfileId: CA_UUID, weeksAhead: 4 })

    expect(mockedApi.post).toHaveBeenCalledWith(
      '/appointments/availability-rules/generate',
      { caProfileId: CA_UUID, weeksAhead: 4 }
    )
    expect(result.slotsCreated).toBe(14)
    expect(result.slotsSkipped).toBe(3)
    expect(result.rulesProcessed).toBe(2)
  })

  it('accepts empty request (uses backend defaults)', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { caProfileId: CA_UUID, rulesProcessed: 1, slotsCreated: 7, slotsSkipped: 0 },
    })
    await generateSlotsFromRules({})
    expect(mockedApi.post).toHaveBeenCalledWith('/appointments/availability-rules/generate', {})
  })
})

// ---------------------------------------------------------------------------
// cancelAppointmentAsCA
// ---------------------------------------------------------------------------

describe('cancelAppointmentAsCA', () => {
  it('calls POST /appointments/{id}/cancel-by-ca with reason', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: {} })
    await cancelAppointmentAsCA('appt-uuid-1', 'Emergency — unable to attend')
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/appointments/appt-uuid-1/cancel-by-ca',
      { reason: 'Emergency — unable to attend' }
    )
  })

  it('does NOT call the old /cancel endpoint', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: {} })
    await cancelAppointmentAsCA('appt-uuid-2', 'Rescheduled')
    const url: string = mockedApi.post.mock.calls[0][0]
    expect(url).toContain('cancel-by-ca')
    expect(url).not.toBe('/appointments/appt-uuid-2/cancel')
  })

  it('sends reason in POST body (backend requires it — validator rejects empty)', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: {} })
    await cancelAppointmentAsCA('appt-uuid-3', 'CA unavailable due to illness')
    const body = mockedApi.post.mock.calls[0][1]
    expect(body).toHaveProperty('reason')
    expect(typeof body.reason).toBe('string')
    expect(body.reason.length).toBeGreaterThan(0)
  })
})
