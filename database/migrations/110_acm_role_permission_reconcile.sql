-- =============================================================================
-- 110_acm_role_permission_reconcile.sql
-- 2026-07-05 full-verification campaign — access-control matrix (ACM) remediation.
--
-- Reconciles auth.role_permission grants on SYSTEM roles (organization_id IS NULL)
-- to close server-side authorization holes found by the per-role E2E sweep.
-- All statements are idempotent (DELETE ... WHERE / INSERT ... ON CONFLICT DO NOTHING),
-- self-adjusting via name JOINs (no hardcoded role/permission IDs), and touch DATA only
-- — no column or table is altered. Re-runnable.
--
-- Revokes are HARD DELETEs of the specific role_permission rows; EffectivePermissionResolver
-- filters rp.deleted_at IS NULL, so removing the row fully revokes the grant.
--
--   ACM-03 (Critical): MANAGER and REVIEWER carry 'admin.dashboard.read', which gates the
--     platform-admin routes GET /auth/admin/audit-events and GET /admin/health/aggregate
--     (plus the cross-org operational dashboards). No structurally-similar org role
--     (ORG_ADMIN, OPERATIONS_MANAGER, HR) holds it; after this migration only SUPER_ADMIN
--     retains it (and SUPER_ADMIN short-circuits to "*" regardless). REVOKE from both.
--
--   ACM-05 (High): ORG_ADMIN carries 'subscription.plan.create' + 'subscription.plan.update',
--     which gate the PLATFORM-admin cross-tenant subscriber list / MRR endpoints
--     (GET /subscriptions/admin/list, /subscriptions/mrr, /mrr/history, /events).
--     Subscription plans are SnapAccount's own platform pricing tiers — not an org-level
--     concern. REVOKE both from ORG_ADMIN (leaves SUPER_ADMIN only).
--
--   ACM-04 (Critical/IDOR, least-privilege leg): ORG_ADMIN carries 'chat.slots.manage'.
--     CA availability management is a CA-provider action; a non-CA role has no CA profile
--     to manage. The handler-level IDOR ownership check (this campaign's code fix) already
--     blocks cross-profile writes, but ORG_ADMIN should not hold the permission at all.
--     REVOKE from ORG_ADMIN. (ORG_ADMIN keeps 'chat.appointments.book' — booking a CA
--     consultation is a legitimate org action.)
--
--   ACM-10 (Medium): the CA system role is MISSING 'chat.slots.manage', so the seeded CA
--     user cannot set up or view their own consultation availability. GRANT it to CA.
--
-- Depends on: 036_auth_rbac_permission_catalog_seed.sql (permission rows exist).
-- =============================================================================

-- ── ACM-03: revoke admin.dashboard.read from MANAGER + REVIEWER ───────────────
DELETE FROM auth.role_permission rp
USING auth.role r, auth.permission p
WHERE rp.role_id       = r.id
  AND rp.permission_id = p.id
  AND r.organization_id IS NULL
  AND r.name IN ('MANAGER', 'REVIEWER')
  AND p.name = 'admin.dashboard.read';

-- ── ACM-05: revoke subscription.plan.create/update from ORG_ADMIN ─────────────
DELETE FROM auth.role_permission rp
USING auth.role r, auth.permission p
WHERE rp.role_id       = r.id
  AND rp.permission_id = p.id
  AND r.organization_id IS NULL
  AND r.name = 'ORG_ADMIN'
  AND p.name IN ('subscription.plan.create', 'subscription.plan.update');

-- ── ACM-04: revoke chat.slots.manage from ORG_ADMIN (non-CA, least privilege) ──
DELETE FROM auth.role_permission rp
USING auth.role r, auth.permission p
WHERE rp.role_id       = r.id
  AND rp.permission_id = p.id
  AND r.organization_id IS NULL
  AND r.name = 'ORG_ADMIN'
  AND p.name = 'chat.slots.manage';

-- ── ACM-10: grant chat.slots.manage to CA (manage own availability) ───────────
INSERT INTO auth.role_permission (id, role_id, permission_id, is_allowed)
SELECT gen_random_uuid(), r.id, p.id, TRUE
FROM   auth.role r
JOIN   auth.permission p ON p.name = 'chat.slots.manage' AND p.deleted_at IS NULL
WHERE  r.organization_id IS NULL
  AND  r.name = 'CA'
  AND  r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- End 110_acm_role_permission_reconcile.sql
-- =============================================================================
