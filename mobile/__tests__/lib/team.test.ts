/**
 * Team / Org-Invite API client — unit tests.
 *
 * Verifies each helper hits the documented /auth/team* and /auth/invite/* paths
 * with the right payload, and — most importantly — that validateInviteToken
 * treats HTTP 410 (Gone) as a valid "invalid invite" result instead of throwing.
 *
 * Mock pattern: declare jest.fn() inside the factory (avoids hoisting issues) —
 * same approach as __tests__/api/documents.test.ts.
 */

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

import axios from 'axios';
import { apiClient } from '../../src/lib/api';
import {
  listMembers,
  inviteMember,
  listInvites,
  resendInvite,
  revokeInvite,
  validateInviteToken,
  acceptInvite,
  INVITE_ROLE_OPTIONS,
} from '../../src/lib/team';

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockDelete = apiClient.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('role catalogue', () => {
  it('exposes the three role names with Team Member as default', () => {
    expect(INVITE_ROLE_OPTIONS.map((o) => o.name)).toEqual(['ORG_MEMBER', 'CA', 'MANAGER']);
    expect(INVITE_ROLE_OPTIONS.find((o) => o.isDefault)?.name).toBe('ORG_MEMBER');
  });
});

describe('listMembers', () => {
  it('GET /auth/team forwards filters and normalizes the page', async () => {
    mockGet.mockResolvedValue({
      data: { items: [{ userId: 'u1', email: 'a@x.com' }], totalCount: 1 },
    });
    const page = await listMembers({ role: 'CA', status: 'active', page: 2, pageSize: 10 });
    expect(mockGet).toHaveBeenCalledWith('/auth/team', {
      params: { role: 'CA', status: 'active', page: 2, pageSize: 10 },
    });
    expect(page.totalCount).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it('defaults to empty items / zero count when the body is missing', async () => {
    mockGet.mockResolvedValue({ data: undefined });
    await expect(listMembers()).resolves.toEqual({ items: [], totalCount: 0 });
  });
});

describe('inviteMember', () => {
  it('POSTs email + role and includes phone / customMessage when provided', async () => {
    mockPost.mockResolvedValue({
      data: { inviteId: 'inv1', token: 'raw-token', expiresAt: '2026-07-01' },
    });
    const res = await inviteMember({
      email: '  new@x.com ',
      role: 'CA',
      phone: ' +911234567890 ',
      customMessage: ' join us ',
    });
    expect(mockPost).toHaveBeenCalledWith('/auth/team/invite', {
      email: 'new@x.com',
      role: 'CA',
      phone: '+911234567890',
      customMessage: 'join us',
    });
    expect(res.token).toBe('raw-token');
  });

  it('omits phone / customMessage when blank', async () => {
    mockPost.mockResolvedValue({ data: { inviteId: 'i', token: 't', expiresAt: 'e' } });
    await inviteMember({ email: 'a@x.com', role: 'ORG_MEMBER', phone: '  ' });
    expect(mockPost).toHaveBeenCalledWith('/auth/team/invite', {
      email: 'a@x.com',
      role: 'ORG_MEMBER',
    });
  });
});

describe('listInvites', () => {
  it('GET /auth/team/invites returns the list (and [] when empty)', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ inviteId: 'i1' }] });
    await expect(listInvites()).resolves.toHaveLength(1);
    mockGet.mockResolvedValueOnce({ data: undefined });
    await expect(listInvites()).resolves.toEqual([]);
  });
});

describe('resendInvite / revokeInvite', () => {
  it('resend POSTs to the resend path', async () => {
    mockPost.mockResolvedValue({ data: { expiresAt: '2026-08-01' } });
    await expect(resendInvite('inv9')).resolves.toEqual({ expiresAt: '2026-08-01' });
    expect(mockPost).toHaveBeenCalledWith('/auth/team/invites/inv9/resend');
  });

  it('revoke DELETEs the invite', async () => {
    mockDelete.mockResolvedValue({});
    await revokeInvite('inv9');
    expect(mockDelete).toHaveBeenCalledWith('/auth/team/invites/inv9');
  });
});

describe('validateInviteToken', () => {
  it('GET /auth/invite/{token} returns the valid preview (encoding the token)', async () => {
    mockGet.mockResolvedValue({
      data: {
        isValid: true,
        inviteId: 'inv1',
        organizationName: 'Acme Pvt Ltd',
        email: 'a@x.com',
        roleName: 'CA',
        roleDisplayName: 'Chartered Accountant',
        expiresAt: '2026-07-01',
      },
    });
    const res = await validateInviteToken('tok/with+chars');
    expect(mockGet).toHaveBeenCalledWith('/auth/invite/tok%2Fwith%2Bchars');
    expect(res.isValid).toBe(true);
    if (res.isValid) expect(res.organizationName).toBe('Acme Pvt Ltd');
  });

  it('treats HTTP 410 as a valid {isValid:false} result instead of throwing', async () => {
    const err = Object.assign(new Error('Gone'), {
      isAxiosError: true,
      response: { status: 410, data: { isValid: false, message: 'Invite expired' } },
    });
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    mockGet.mockRejectedValue(err);

    const res = await validateInviteToken('expired-token');
    expect(res.isValid).toBe(false);
    if (!res.isValid) expect(res.message).toBe('Invite expired');
  });

  it('re-throws non-410 transport errors', async () => {
    const err = Object.assign(new Error('boom'), {
      isAxiosError: true,
      response: { status: 500, data: {} },
    });
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    mockGet.mockRejectedValue(err);
    await expect(validateInviteToken('t')).rejects.toThrow('boom');
  });
});

describe('acceptInvite', () => {
  it('POSTs to /auth/invite/{token}/accept and returns the joined org', async () => {
    mockPost.mockResolvedValue({
      data: { organizationId: 'org1', organizationName: 'Acme', roleId: 'r1', roleName: 'CA' },
    });
    const res = await acceptInvite('tok1');
    expect(mockPost).toHaveBeenCalledWith('/auth/invite/tok1/accept');
    expect(res.organizationId).toBe('org1');
  });
});
