-- =============================================================================
-- 059_auth_seed_org_member_role.sql
-- Phase 2 (User-Hierarchy, Issues 2 & 4): introduce a baseline ORG_MEMBER system
-- role — the default role assigned when a business owner invites a team member
-- into their SME organization from the mobile app.
--
-- This is the "org-member" half of the deliberately-split Employee concept:
--   • EMPLOYEE  (user_type) = standalone salaried individual taxpayer, no org.
--   • ORG_MEMBER (role)     = a person who belongs to an SME's organization with
--                             an org-scoped role (this seed).
--
-- ORG_MEMBER is intentionally minimal — a basic team member who can work with the
-- org's documents and view filings/teammates. Owners can assign richer roles
-- (CA, MANAGER, …) at invite time or promote later from the admin Team screen.
--
-- The delegation rule (CreateInvitationCommand) requires the inviter's effective
-- permissions ⊇ the assigned role's permissions. ORG_ADMIN (migration 036 §3b)
-- holds all org.* + document.* + itr.* perms, so it can always grant ORG_MEMBER.
--
-- ADDITIVE, idempotent. Depends on 036 (permission catalog + roles).
-- =============================================================================

-- 1. Baseline ORG_MEMBER system role (organization_id NULL = system/global).
--    Mirrors the 036 system-role insert + partial-unique ON CONFLICT arbiter.
INSERT INTO auth.role (id, name, display_name, description, is_system_role, is_active, organization_id)
VALUES
    (gen_random_uuid(), 'ORG_MEMBER', 'Team Member',
     'A member of an organization. Works with the org''s documents and views filings and teammates. Default role for invited team members.',
     TRUE, TRUE, NULL)
ON CONFLICT (name) WHERE organization_id IS NULL AND deleted_at IS NULL DO NOTHING;

-- 2. Default grants for ORG_MEMBER — basic team-member capabilities.
INSERT INTO auth.role_permission (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM auth.role r JOIN auth.permission p ON TRUE
WHERE r.name = 'ORG_MEMBER'
  AND p.name IN (
        'org.members.read',
        'document.read','document.update','document.share',
        'itr.filing.read','itr.grievance.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 059
-- =============================================================================
