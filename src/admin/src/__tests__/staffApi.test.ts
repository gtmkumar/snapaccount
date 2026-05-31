/**
 * staffApi — Team Staff/Workload/KPI data-spine tests (Screens 87/89/90).
 * Covers the fan-out merge (getStaffWorkloadGrid), the load-level thresholds,
 * and resilient degradation when a queue service fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }))

import api from '@/lib/api'
import {
  getStaffList, getStaffWorkloadGrid, loadLevel, QUEUE_KEYS,
} from '@/lib/staffApi'

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>

const STAFF = [
  { userId: 'u1', name: 'Riya Sharma', email: 'riya@snap.in', role: 'CA', roleDisplayName: 'CA', status: 'active', joinedAt: '2024-01-01T00:00:00Z', lastActiveAt: '2024-03-01T00:00:00Z' },
  { userId: 'u2', name: 'Arjun Kumar', email: 'arjun@snap.in', role: 'OPERATIONS_MANAGER', roleDisplayName: 'Ops Manager', status: 'active', joinedAt: null, lastActiveAt: null },
]

beforeEach(() => {
  mockGet.mockReset()
})

/** Routes a mocked GET to the right canned payload by path. */
function routeGet(overrides: Record<string, unknown> = {}) {
  const payloads: Record<string, unknown> = {
    '/auth/admin/staff': STAFF,
    '/gst/admin/workload-by-user': [{ userId: 'u1', assigned: 5, completed: 2 }],
    '/itr/admin/workload-by-user': [{ userId: 'u1', assigned: 12, completed: 1 }],
    '/chat/admin/workload-by-user': [{ userId: 'u2', assigned: 3, completed: 9 }],
    '/callbacks/admin/workload-by-user': [{ userId: 'u1', assigned: 1, completed: 4 }],
    ...overrides,
  }
  mockGet.mockImplementation((url: string) => {
    if (url in payloads) {
      const data = payloads[url]
      if (data instanceof Error) return Promise.reject(data)
      return Promise.resolve({ data })
    }
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

describe('staffApi.loadLevel', () => {
  it('maps counts to design Screen-89 thresholds', () => {
    expect(loadLevel(0)).toBe('idle')
    expect(loadLevel(10)).toBe('normal')
    expect(loadLevel(11)).toBe('busy')
    expect(loadLevel(20)).toBe('busy')
    expect(loadLevel(21)).toBe('heavy')
    expect(loadLevel(30)).toBe('heavy')
    expect(loadLevel(31)).toBe('overloaded')
  })
})

describe('staffApi.getStaffList', () => {
  it('parses the staff roster', async () => {
    routeGet()
    const staff = await getStaffList()
    expect(staff).toHaveLength(2)
    expect(staff[0]!.email).toBe('riya@snap.in')
  })

  it('passes the role filter as a query param', async () => {
    routeGet()
    await getStaffList('CA')
    expect(mockGet).toHaveBeenCalledWith('/auth/admin/staff', { params: { role: 'CA' } })
  })
})

describe('staffApi.getStaffWorkloadGrid', () => {
  it('merges per-queue counts by userId and totals them', async () => {
    routeGet()
    const { rows, errors } = await getStaffWorkloadGrid()

    expect(errors).toEqual({})
    expect(rows).toHaveLength(2)

    // Sorted by totalAssigned desc → u1 (5+12+0+1=18) before u2 (0+0+3+0=3)
    const [first, second] = rows
    expect(first!.userId).toBe('u1')
    expect(first!.queues).toEqual({ gst: 5, itr: 12, chat: 0, callbacks: 1 })
    expect(first!.totalAssigned).toBe(18)
    expect(first!.totalCompleted).toBe(2 + 1 + 0 + 4)

    expect(second!.userId).toBe('u2')
    expect(second!.queues.chat).toBe(3)
    expect(second!.totalAssigned).toBe(3)
  })

  it('degrades gracefully when one queue service fails', async () => {
    routeGet({ '/itr/admin/workload-by-user': new Error('itr down') })
    const { rows, errors } = await getStaffWorkloadGrid()

    expect(errors.itr).toBeDefined()
    // ITR column falls back to 0; other queues still merge.
    const u1 = rows.find(r => r.userId === 'u1')!
    expect(u1.queues.itr).toBe(0)
    expect(u1.queues.gst).toBe(5)
  })

  it('returns no rows when the staff roster itself fails', async () => {
    routeGet({ '/auth/admin/staff': new Error('auth down') })
    const { rows, errors } = await getStaffWorkloadGrid()
    expect(rows).toEqual([])
    expect(errors.staff).toBeDefined()
  })

  it('covers every declared queue key', () => {
    expect([...QUEUE_KEYS].sort()).toEqual(['callbacks', 'chat', 'gst', 'itr'])
  })
})
