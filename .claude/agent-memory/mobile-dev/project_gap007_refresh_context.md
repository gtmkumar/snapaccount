---
name: GAP-007 / BUG-5 — post-onboarding org-context token refresh
description: Pattern and hook-in points for refreshing org-scoped JWT after org creation or invite accept
type: project
---

GAP-007 (BUG-5) is fixed in Phase 7 Wave 2 task M2. The root cause is that the JWT issued at OTP/login has no OrganizationId claim (org doesn't exist yet at login time). After `POST /auth/organizations` or `POST /auth/invite/{token}/accept`, the backend's new endpoint `POST /auth/token/refresh-context` re-mints the access token with the org claim — without rotating the opaque refresh token.

**Hook-in points:**
1. `BusinessProfileWizardScreen.tsx` step 4 submit — after `POST /auth/organizations` succeeds, calls `refreshContextAndSwap()` then `markAuthenticated()`.
2. `AcceptInviteScreen.tsx` `handleAccept` — after `acceptInvite(token)` succeeds, calls `refreshContextAndSwap()` then fetches and hydrates the org list.

**Why:** Both flows predated the org. The JWT they held was org-less, causing 409 `Org.InvalidContext` on any org-scoped call (e.g. `POST /auth/team/invite`).

**How to apply:** Any future flow that grants the user a new org membership (e.g. org switcher, M8) should call `refreshContextAndSwap()` after the membership is confirmed so the access token stays current.

**Implementation:**
- `mobile/src/api/auth.ts` — `refreshContext()` pure API function + `RefreshContextResponse` type
- `mobile/src/lib/api.ts` — `refreshContextAndSwap()` store-aware helper (non-fatal, returns bool)
- `mobile/src/store/authStore.ts` — `swapAccessToken(accessToken)` action (only updates `firebaseToken`, not `refreshToken`)
- Tests: `__tests__/api/auth.test.ts`, `__tests__/store/authStore.test.ts`, `__tests__/lib/refreshContextAndSwap.test.ts` (new file)
