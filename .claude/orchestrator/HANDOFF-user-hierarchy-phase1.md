# HANDOFF — User Hierarchy Phase 1 (persona split) + Nav picker UX

**Date:** 2026-06-06
**Branch (working tree):** `fix/chat-callback-write-reconciliation` — **NOT committed**, no PR.
**Driver doc:** `docs/design/user-hierarchy-gap-analysis.md` (9 issues, impact, recommendations, status checklist).

---

## What was asked

1. Improve the admin Navigation **permission picker** (it confusingly showed the full flat catalog; user thought already-granted perms should be pre-checked).
2. Analyze `SnapAccount_User_Hierarchy.md` vs the real implementation (web + mobile); find gaps; document/impact/fix; **update the flows**.

## Decisions taken (by user)

- **Employee model = "Both, kept distinct":** `EMPLOYEE` = standalone **salaried individual** (personal ITR, no org). SME org-staff become a separate **`ORG_MEMBER`** concept **later (Phase 2)**.
- **Action:** safe fixes **+ build the Individual persona flow now**.

---

## Ground truth (from a 3-surface code survey)

- **Backend & admin web are mature and aligned.** `UserType` (`BUSINESS_OWNER|EMPLOYEE|STAFF`), 12 seeded roles (incl. the 4 named staff roles, all with role-specific admin screens), 60 permissions, full `Organization` + `OrganizationMember` model, customer/staff split is relational (presence of `auth.user_role`).
- **Mobile was the gap:** every user was hard-coded `business_owner`; the salaried-individual persona existed in types only; forced GSTIN/business/org onboarding on everyone; ITR buried under "More"; tab labeled "GST/ITR" contained no ITR.

---

## Changes made (Phase 1 — DONE, all verified)

### Admin web (earlier task in same session)
- `src/admin/src/pages/settings/NavigationManagementPage.tsx` — relabeled "Required permissions" → "Who can see this item"; full-sentence hint; **"Public — visible to all" callout** when none selected; **selected-count + Clear all**; **module-grouped** permission list with sticky headers + descriptions; empty-search state. (Clarified the misconception: the checkboxes are the menu item's *gate*, not the admin's own perms.)

### Backend (`backend/Services/PlatformService/`)
- `.../Users/Queries/GetCurrentUser/GetCurrentUserQuery.cs` — `GET /auth/me` now returns `UserType` (from `Profile?.UserType`, null if no profile).
- `.../Users/Commands/UpdateUserProfile/UpdateUserProfileCommand.cs` — added optional `UserType` param, **validated `BUSINESS_OWNER|EMPLOYEE`** (STAFF rejected); stamped on profile create + update. Lets Individual onboarding set `EMPLOYEE` **without creating an org**.
- `.../Platform.WebApi/Endpoints/Auth/Auth.cs` — threaded `UserType` through `PUT /auth/profile` DTO + handler.
- `database/migrations/058_auth_seed_platform_refdata_ai_permissions.sql` — **NEW**; seeds `platform.refdata.manage` + `platform.ai.manage` (were enforced in code but unseeded → ungrantable/invisible), grants both to `SUPER_ADMIN`. **Applied to local dev DB + verified.**

### Mobile (`mobile/`)
- **NEW** `src/lib/onboarding.ts` — `mapServerUserType` / `toServerUserType` / `fetchServerUserType()` (GET /auth/me → persona).
- **NEW** `src/screens/auth/PersonaSelectionScreen.tsx` — the onboarding fork ("I run a business" vs "I'm a salaried individual").
- **NEW** `src/screens/auth/IndividualProfileWizardScreen.tsx` — PAN + name + DOB only; PUT `/auth/profile` with `UserType=EMPLOYEE`; **no GSTIN/business/org**; saves PAN doc; enters app.
- `src/navigation/AuthNavigator.tsx` — registered `PersonaSelection` + `IndividualProfileWizard`.
- `src/navigation/AppNavigator.tsx` — **persona-conditional tabs**. Business: Home·Documents·GST·Loans·More (unchanged). Individual: **Taxes(ITR)·Documents·Support(Chat)·More**. Fixed "GST/ITR" → "GST".
- `OTPVerifyScreen` / `PasswordAuthScreen` / `PhoneEntryScreen` (social) / `TwoFactorChallengeScreen` — stopped hard-coding `business_owner`; new users → `PersonaSelection`; returning users **hydrate real persona from server** (also fixes returning-employee-has-no-org edge in social sign-in).
- `BusinessProfileWizardScreen` — now stamps `UserType=BUSINESS_OWNER` explicitly.

### Docs
- `docs/design/user-hierarchy-gap-analysis.md` — **NEW**, full analysis + decision + checklist.
- `SnapAccount_User_Hierarchy.md` — refreshed: Employee clarified = individual taxpayer; real seeded roles listed (Issue 9).

---

## Verification (all green)

| Check | Result |
|---|---|
| Backend build | clean |
| Backend unit | **553/553** |
| Integration — auth flow + `/auth/me` | **7/7** |
| Integration — user/profile (`PUT /auth/profile`) | **30/30** |
| Integration — full suite | **87/87 executed passed**, then a **flaky host-teardown crash** (pre-existing, NOT this change) |
| Mobile auth tests | **14/14** |
| Mobile type-check / lint (changed files) | clean (repo has pre-existing TS errors in other files) |
| DB migration 058 | applied + verified |

⚠️ **Known flaky:** the AuthService integration host crashed on teardown after 87 passing tests (same instability that earlier spawned an 8h+ zombie `testhost`). Unrelated to these changes (targeted runs of the affected paths all pass). Worth a separate investigation.

---

## Not done / next

- **Phase 2 (deferred):** org **invite/join** (owner invites team member; employee joins via code/deep-link) + rename SME org-staff → `ORG_MEMBER` (gap-analysis Issues 2 & 4).
- **Backlog:** admin **Accounting** back-office screen, or de-scope `accounting.*` servicing (Issue 6); optional server-side `UserType` defaulting inside the social/password commands (Issue 3 hardening).
- **Housekeeping:** nothing committed. Working tree also still carries the earlier `fix/chat-callback-write-reconciliation` work (migrations 056/057, chat/callback enum + read-receipt fixes) — decide commit/PR strategy (these Phase-1 changes are logically separate and could go on `feat/user-hierarchy-phase1`).
- Investigate the flaky AuthService integration host-teardown crash.
