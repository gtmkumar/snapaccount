# HANDOFF — User Hierarchy Phase 2 (org invite/join + ORG_MEMBER)

**Date:** 2026-06-06
**Branch (working tree):** `fix/chat-callback-write-reconciliation` — **NOT committed**, no PR.
**Driver doc:** `docs/design/user-hierarchy-gap-analysis.md` (Phase 2 checklist now ✅).
**Builds on:** `HANDOFF-user-hierarchy-phase1.md` (persona split — also still uncommitted in this tree).

---

## What was asked
Start Phase 2 from the Phase-1 handoff: org **invite/join** (owner invites a team member; invitee joins via code/deep-link) + the `ORG_MEMBER` concept (gap-analysis Issues 2 & 4).

## Key discovery (re-scoped the work)
The backend invite/member system **already existed and is production-grade** — it powers the admin-web Team page (`teamApi.ts`). Entities (`Invitation`, `OrganizationMember`), commands (`CreateInvitation`/`AcceptInvitation`/`ValidateInviteToken`/`Revoke`/`Resend`, member update/suspend/reactivate/remove), queries, `org.members.*` permissions, and endpoints (`/auth/team/*`, `/auth/invite/*`) were all present. **The gap was 100% mobile** + a few backend correctness fixes. So Phase 2 = mobile feature + 3 small backend changes.

---

## Changes made (Phase 2 — DONE, all verified)

### Backend (`backend/Services/AuthService/` + `database/`)
1. **Keystone fix** — `.../Organizations/Commands/CreateOrganization/CreateOrganizationCommand.cs`: the creating owner is now added as an `OrganizationMember` with the **`ORG_ADMIN`** role. Before, org creation set only `Organization.OwnerUserId` with **no membership/role**, so `FirebaseAuthService.BuildSessionClaimsAsync` resolved **no `organizationId` and no `org.*` permissions** into the session JWT → the owner could never invite anyone. Role lookup is graceful (skips membership if `ORG_ADMIN` absent), so existing tests are unaffected.
2. **`ORG_MEMBER` role** — `database/migrations/059_auth_seed_org_member_role.sql` (additive, idempotent, applied + verified on local dev DB). System role, basic perms: `org.members.read`, `document.read/update/share`, `itr.filing.read`, `itr.grievance.read`. Default for invited members. `ORG_ADMIN` ⊇ these, so the invite delegation rule allows granting it.
3. **Surface the invite token** — `.../AuthService.Api/Endpoints/Invitations.cs` `CreateInvite` now returns `{ inviteId, token, expiresAt }` (the raw one-time token was previously discarded, contradicting the endpoint's own summary). Lets mobile build a shareable `snapaccount://invite/{token}` link.

### Mobile (`mobile/`)
- **NEW** `src/lib/team.ts` — typed client for all `/auth/team*` + `/auth/invite/*` endpoints; treats HTTP 410 on validate as a clean "invalid invite". `+ __tests__/lib/team.test.ts` (12 tests).
- **NEW** `src/screens/team/TeamScreen.tsx` + `InviteMemberModal.tsx` — owner Team screen (members, pending invites w/ resend/revoke, invite form w/ role picker ORG_MEMBER/CA/MANAGER, Share link). Gated to `business_owner`.
- **NEW** `src/screens/auth/AcceptInviteScreen.tsx` — invitee flow (deep link or manual code → validate → accept → **force token refresh** → hydrate orgs → enter app). Handles 403 identity-mismatch / 409 already-* / 410 invalid.
- `src/lib/api.ts` — added `refreshAccessToken()` (force token refresh to pick up new org claims) + `fetchOrganizations()` + `ServerOrganization`.
- `src/navigation/RootNavigator.tsx` — `linking` config (`snapaccount://invite/:token` → AcceptInvite, nested for both Auth + MoreTab).
- `src/navigation/MoreStack.tsx`, `AuthNavigator.tsx` — registered `Team` + `AcceptInvite`.
- `src/notifications/notificationRouter.ts` — `org_invite` push → AcceptInvite.
- `src/screens/profile/MoreScreen.tsx` (owner Team tile + "Join an organization" row) + `PersonaSelectionScreen.tsx` ("Join an organization" entry).
- `src/i18n/{en,hi,bn}.json` — `mobile.team.*` + `mobile.auth.invite.*` (hi/bn placeholders = English).

---

## Verification (all green)
| Check | Result |
|---|---|
| Backend build (AuthService) | clean, 0 warnings |
| Backend unit | **553/553** |
| Backend integration | **102/102** (no teardown crash this run) |
| Migration 059 | applied to local dev DB + verified (role + 6 grants) |
| Mobile type-check | **0 errors in any Phase 2 file** (75 pre-existing errors elsewhere, unchanged) |
| Mobile lint (changed files) | exit 0 |
| Mobile `team.test.ts` | **12/12** |
| i18n keys present in en/hi/bn | yes |

---

## Known limitations / next
- **Acceptance identity match (by design):** invitee must be signed in with the account whose **email or phone matches the invite** (backend M1-R-002). Mobile is phone-first → the invite form collects the invitee's phone (recommended) + required email.
- **Deep-link while logged out:** tapping an invite link unauthenticated routes to sign-in, but the token isn't auto-carried back through the Auth→App navigator swap (best-effort: re-open link / re-paste). Primary path (already-authenticated user) is fully wired. A small enhancement could stash the pending token and resume after auth.
- **Resend** issues a new token but the route doesn't return it (only `expiresAt`), so a fresh share-link is only available at create time — matches the backend contract.
- **Housekeeping:** working tree now carries Phase 1 **and** Phase 2 (both logically separate from the earlier chat/callback commits, which are already committed). Decide commit/PR strategy — e.g. `feat/user-hierarchy` for Phase 1+2, or two branches. `.claude/settings.json` has an unrelated permission-glob tweak — keep it out of the feature commit.
- **Optional Phase 2.x:** add `ORG_MEMBER` to the `LocalAuthService` dev runtime seed (so it exists locally without applying the SQL migration) and to integration-test seeds if you later add backend tests exercising the ORG_MEMBER invite path.
