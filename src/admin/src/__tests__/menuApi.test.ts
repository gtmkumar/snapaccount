/**
 * menuApi — recursive tree schema contract test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }))

import api from '@/lib/api'
import { getMyMenu, MenuNodeSchema } from '@/lib/menuApi'

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>

beforeEach(() => mockGet.mockReset())

describe('menuApi.getMyMenu', () => {
  it('parses a nested menu tree', async () => {
    mockGet.mockResolvedValue({
      data: [
        { key: 'dashboard', label: 'Dashboard', iconKey: 'LayoutDashboard', url: '/dashboard', children: [] },
        {
          key: 'loans', label: 'Loans', iconKey: null, url: '/loans',
          children: [{ key: 'loans.partner_banks', label: 'Partner Banks', iconKey: 'CreditCard', url: '/loans/partner-banks', children: [] }],
        },
      ],
    })

    const tree = await getMyMenu()
    expect(tree).toHaveLength(2)
    expect(tree[1]!.children[0]!.key).toBe('loans.partner_banks')
    expect(mockGet).toHaveBeenCalledWith('/auth/me/menu')
  })

  it('accepts a null iconKey and rejects a malformed node', () => {
    expect(MenuNodeSchema.safeParse(
      { key: 'x', label: 'X', iconKey: null, url: '/x', children: [] }).success).toBe(true)
    expect(MenuNodeSchema.safeParse(
      { key: 'x', label: 'X', url: '/x' }).success).toBe(false)
  })
})
