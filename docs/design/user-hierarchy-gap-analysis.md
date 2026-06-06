# SnapAccount — User Hierarchy & Flow Gap Analysis

**Date:** 2026-06-06
**Scope:** Reconciles `SnapAccount_User_Hierarchy.md` against the actual implementation across **backend (RBAC + user model)**, **admin web (`src/admin/`)**, and **mobile (`mobile/`)**.
**Method:** Full read-only code survey of all three surfaces. Every finding is backed by file evidence.

---

## TL;DR — Are we on the right track?

**Mostly yes — but the mobile app has a fundamental persona gap.**

| Surface | Verdict |
|---|---|
| **Backend RBAC / user model** | ✅ Mature. UserType + 12 system roles + 60 permissions + full Organization/Member model. Supports everything the doc describes and more. |
| **Admin web** | ✅ Mature. Staff-only, customer/staff split enforced, all 4 named staff roles have role-specific workflows, Org + Members UI, Roles & Permissions UI. |
| **Mobile** | ⚠️ **Single persona only.** Everyone is treated as a Business Owner. The "Employee (Salaried User)" persona from the doc is effectively unbuilt — it exists in the type system but no code path ever sets it or branches on it. |
| **The doc itself** | ⚠️ Out of date and internally ambiguous (two conflicting meanings of "Employee"; missing the org-RBAC roles). |

The headline: **we are building the right system, but the mobile app currently delivers ~50% of the intended persona model.** One product decision (below) unblocks the fix.

---

## The implemented model (ground truth)

### User types (backend) — `auth.user_profile.user_type`
`BUSINESS_OWNER` · `EMPLOYEE` · `STAFF` — DB CHECK-constrained.
- `backend/Services/AuthService/AuthService.Domain/Entities/UserProfile.cs:8`
- `database/migrations/001_auth_schema.sql:122`

### Roles (12 system roles, two seed layers)
- **Customer / operational:** `BUSINESS_OWNER`, `EMPLOYEE`, `DATA_ENTRY_OPERATOR`, `SUPPORT_EXECUTIVE`, `CA`, `OPERATIONS_MANAGER`, `PARTNER_BANK_REP` — `database/migrations/999_seed_reference_data.sql:10`
- **Org-RBAC / platform:** `SUPER_ADMIN`, `ORG_ADMIN`, `CA`, `MANAGER`, `HR`, `REVIEWER` — `database/migrations/036_auth_rbac_permission_catalog_seed.sql:126`
- All 4 named staff roles from the doc **exist** and **have role-specific admin screens** (CA computation panel, Support callbacks/chat, Data-Entry document queue, Ops team/KPI/bank-comms).

### Permissions — 60 seeded across 11 resources
`org.* platform.* accounting.* admin.* callback.* chat.* document.* gst.* itr.* loan.* notification.* subscription.*`

### Organization model — fully supports Owner + Employees
- `Organization.OwnerUserId` + `OrganizationMember(OrganizationId, UserId, RoleId, IsActive)` junction, unique on `(org, user)`.
- `backend/Services/AuthService/AuthService.Domain/Entities/Organization.cs`, `OrganizationMember.cs`; `database/migrations/001_auth_schema.sql:159,202`

### Customer vs Staff — relational, not a flag
A user is **staff** iff they hold an active `auth.user_role` with an operational role; otherwise **customer**.
- `.../Admin/Queries/GetStaffList/GetStaffListQuery.cs:39`, `.../Admin/Queries/ListUsers/ListUsersQuery.cs:19`

---

## Findings

### 🔴 ISSUE 1 — Mobile collapses two personas into one (CRITICAL)

**What:** The doc defines two distinct mobile personas with different feature sets:
- **Business Owner** → Document Vault, Accounting, Dashboard, GST, Loan Hub, Expert Chat
- **Employee (Salaried)** → Employee Profile, Form 16, Tax Docs, ITR Filing, Callback

The mobile app builds **only the Business Owner experience** and applies it to everyone:
- `userType` is **hard-coded** to `'business_owner'` on every auth path — `OTPVerifyScreen.tsx:79`, `BusinessProfileWizardScreen.tsx:203`, `PhoneEntryScreen.tsx:65`, `TwoFactorChallengeScreen.tsx:67`.
- The mandatory new-user wizard (`BusinessProfileWizardScreen`) collects **PAN + GSTIN + business name/type/industry/address** and **always POSTs a new organization** — `BusinessProfileWizardScreen.tsx:192`.
- Bottom tabs are **fixed for all users**: Home, Documents, GST ("GST/ITR"), Loans, More — `AppNavigator.tsx:59`. No `userType` branch anywhere.
- ITR (the employee's primary job) is **buried two levels deep** under More → ITR Filing.

**Impact on UX:**
- A salaried individual is forced to enter a **GSTIN and business details they do not have** to finish onboarding, and lands on a **business P&L dashboard** that is meaningless to them.
- Their core journey — **ITR filing** — is hidden under a "More" menu while a **Loan Hub** and **GST filing** tab they'll never use occupy prime tab-bar real estate.
- There is **no path to ever become an Employee user**, so the persona can never exist in production regardless of backend support.

**Recommendation:** Add an onboarding **persona fork** and **conditional navigation** (detailed after the decision below). Business path unchanged; Individual/Salaried path skips business/GSTIN/org creation, sets `UserType=EMPLOYEE`, and lands on an ITR-centric home.

---

### 🔴 ISSUE 2 — "Employee" means two different things (CRITICAL, definitional)

**What:** Two incompatible definitions coexist:
- **Doc / DB-view definition:** "Employee (Salaried User)" = a **standalone individual taxpayer** (personal ITR, Form 16) with **no organization** — see the doc's Database-Oriented View where `Employee User` is a top-level entity parallel to `Organization`, not under it.
- **Backend definition:** `OrganizationMember` "employee" = a **person who belongs to an SME's organization** with an org-scoped role.

These are different concepts sharing one word. The mobile `UserType='EMPLOYEE'` and the org-membership "employee" are **not the same thing** and are **not connected**.

**Impact:** Ambiguity blocks design. Until we pick a meaning, "update the employee flow" is under-specified — the two readings lead to completely different mobile builds (standalone individual vs invite/join an org).

**Recommendation:** **Pick one model explicitly** (decision below) and rename the other concept to remove the collision (e.g. org members → "ORG_MEMBER / staff-of-org"; individual taxpayer → "EMPLOYEE / Salaried Individual").

---

### 🟠 ISSUE 3 — Social & password sign-in never set UserType (HIGH, backend bug)

**What:** Only the OTP `RegisterUserCommand` path writes a `UserProfile.UserType`. `SocialFirebaseAuthCommand` and `PasswordAuthCommands` create a bare `User` with **no `UserProfile` at all**.
- `.../Auth/Commands/SocialFirebaseAuth/SocialFirebaseAuthCommand.cs:182` · `.../Auth/Commands/PasswordAuth/PasswordAuthCommands.cs:80`

**Impact:** A Google/Apple sign-up has **no user type** server-side; the mobile client merely pretends it's `business_owner` locally. Admin customer/staff classification then leans on org-ownership heuristics, so these users can be **mis-bucketed**. Classification is auth-method-dependent — a correctness/consistency hole.

**Recommendation:** Route every new user (regardless of auth method) through the same onboarding step that sets `UserType`; until they complete it, mark them `PENDING`/untyped and force the persona-selection screen on first launch (`IsNewUser=true` already signals this — the mobile side just needs to honour it for social/password too).

---

### 🟠 ISSUE 4 — No customer-facing organization-membership UX (HIGH; severity depends on Issue 2 decision)

**What:** The backend fully models Owner + Employees and the **admin can view** an org's members (`OrganizationDetailPage` → Members tab). But **no mobile UI** lets a business owner **invite** an employee or lets an employee **join** an org. Onboarding always creates a *brand-new* org; it never links to an existing one. Grep for `invite/addEmployee/orgMembers/member` in `mobile/` → **zero hits**.

**Impact:** If "Employee = member of an SME org" is the intended model, that relationship is **unreachable through the product** — it can only be created by dev seed or an admin. The owner→employee org graph stays empty in production.

**Recommendation:** Only relevant if Issue 2 resolves toward the org-member model. If so, add owner-side "Invite team member" + employee-side "Join via invite code/deep link". If the individual-taxpayer model is chosen, this is **out of scope** (no org for employees).

---

### 🟡 ISSUE 5 — Mobile navigation is fixed & mislabeled (MEDIUM)

**What:** 5 hard-coded tabs for all users; the GST tab is **labeled "GST/ITR"** but `GstStack` contains **only GST screens** — ITR lives under More (`AppNavigator.tsx`, `GstStack.tsx`).

**Impact:** The label promises ITR where there is none; the persona whose entire job is ITR has it buried. Misleading IA.

**Recommendation:** Make the tab set conditional on `userType` (part of Issue 1's fix) and stop labeling a GST-only stack "GST/ITR".

---

### 🟡 ISSUE 6 — Admin has no Accounting back-office screen (MEDIUM)

**What:** Mobile business owners use an **Accounting** module (dashboard metrics, financial reports, Tally/CSV export), but there is **no admin route/page** to review ledgers/journals. The backend has `accounting.*` permissions (`fiscal_year.close`, `journal.reverse`, `journal.review`) with no UI behind them.

**Impact:** Operations/CA staff cannot service accounting queries or perform journal review/reversal that the permissions imply. A back-office blind spot for one of the six business-owner pillars.

**Recommendation:** Add an Accounting review screen (journal list + review/reverse actions) gated by `accounting.journal.review`, or explicitly de-scope accounting from staff servicing and remove the dangling permissions.

---

### 🟡 ISSUE 7 — Two permissions are referenced in code but not seeded (MEDIUM)

**What:** `platform.refdata.manage` and `platform.ai.manage` are enforced by `[RequiresPermission]` and gate the Reference Data / AI-config admin features, but they are **absent from the 036 catalog seed** (`AuthService.Domain/Permissions.cs:42-43`).

**Impact:** They function **only** via the `SUPER_ADMIN` `*` wildcard. They **cannot be granted to a custom role** and **don't appear in the Permission Catalog UI**, so the nav-permission picker (the very screen we just improved) can't reference them. Delegating these to a non-super-admin is impossible.

**Recommendation:** Add both to the permission catalog seed (new additive migration) so they're grantable and visible.

---

### 🟢 ISSUE 8 — `STAFF` user type is vestigial (LOW)

`UserType='STAFF'` is allowed by the CHECK constraint but staff are identified **by role**, not by this value. Harmless, but it invites confusion (two ways to "mean staff"). Document that staff classification is role-based and treat `STAFF` user_type as informational only.

---

### 🟢 ISSUE 9 — The hierarchy doc is out of date (LOW, doc hygiene)

`SnapAccount_User_Hierarchy.md` omits: the org-RBAC roles (`ORG_ADMIN`, `MANAGER`, `HR`, `REVIEWER`), the `PARTNER_BANK_REP` staff role, the `SUPER_ADMIN` platform role, and the entire Organization-membership concept. It also predates the customer/staff relational split.

**Recommendation:** Refresh the doc to match the implemented 12-role model and the chosen Employee definition (this document can seed that update).

---

## Recommended target state (pending the decision below)

### Mobile onboarding (proposed)
```
OTP / Social / Password  →  [NEW USER?]
                                 │ yes
                                 ▼
                    ┌──────────────────────────┐
                    │  "How will you use SnapAccount?"   │   ← NEW persona fork
                    │  ① Run my business (SME)           │
                    │  ② File my personal taxes (Salaried)│
                    └──────────────────────────┘
                         │                     │
              Business path             Individual path
       PAN → GSTIN → Aadhaar →      PAN → Name → DOB →
       Business details → create    (no GSTIN, no business,
       org → UserType=BUSINESS_OWNER no org) → UserType=EMPLOYEE
                         │                     │
                 Business tabs           Individual tabs
       Home(P&L) · Documents ·      Home(Tax) · Documents ·
       GST · Loans · More           ITR · Support · More
```

### Conditional navigation (proposed)
| Tab | Business Owner | Salaried Individual |
|---|---|---|
| Home | Financial dashboard (P&L) | Tax-year dashboard (refund/ITR status) |
| Documents | ✅ | ✅ (salary slips, Form 16) |
| Primary #3 | **GST** | **ITR** (promoted from More) |
| Primary #4 | **Loans** | **Support/Chat** |
| More | GST notices, Chat, Loans extras… | GST? (hidden), Loans (optional), Profile |

Business Owner experience is **unchanged**. Only the Individual path is additive.

---

## Decision (2026-06-06)

**Employee model = "Both, kept distinct":** `EMPLOYEE` = a salaried **individual taxpayer** (personal ITR, no org); SME org staff become a separate `ORG_MEMBER` concept later. **Phase 1 = the individual-taxpayer path (now); Phase 2 = org invite/join + rename (deferred).**

## Action checklist

### ✅ Phase 1 — done (this change)
- [x] **Backend:** seed `platform.refdata.manage` + `platform.ai.manage` (Issue 7) — `database/migrations/058_auth_seed_platform_refdata_ai_permissions.sql` (applied to dev DB; granted to SUPER_ADMIN).
- [x] **Backend:** `GET /auth/me` now returns `UserType`; `PUT /auth/profile` accepts an optional `UserType` (BUSINESS_OWNER | EMPLOYEE, validated; STAFF rejected) and stamps it on profile create/update — lets the Individual path set EMPLOYEE without creating an org.
- [x] **Mobile:** new `PersonaSelectionScreen` fork after every auth path (OTP/social/password); new `IndividualProfileWizardScreen` (PAN + name + DOB only, **no GSTIN/business/org**, sets `UserType=EMPLOYEE`).
- [x] **Mobile:** stopped hard-coding `business_owner` — new users pick a persona; returning users hydrate the real `userType` from `GET /auth/me` (fixes Issue 3 on the client, incl. the returning-employee-has-no-org edge case in social sign-in).
- [x] **Mobile:** conditional tab set by `userType` — Individuals get **Taxes (ITR) · Documents · Support · More**; business owners unchanged (**Home · Documents · GST · Loans · More**); fixed the misleading "GST/ITR" label → "GST" (Issue 5).

### ✅ Phase 2 — done (org-member model)
- [x] **Backend:** `CreateOrganizationCommand` now adds the creating owner as an `OrganizationMember` with the `ORG_ADMIN` role — previously the owner got `Organization.OwnerUserId` but **no membership/role**, so `BuildSessionClaimsAsync` resolved no org context and the owner could never invite. (Keystone fix; without it the whole flow is unreachable in production.)
- [x] **Backend:** new `ORG_MEMBER` system role (`database/migrations/059_auth_seed_org_member_role.sql`, applied to dev DB) — the "org-member" half of the split Employee concept (Issues 2 & 4); default role for invited team members, basic perms (`org.members.read`, `document.read/update/share`, `itr.filing.read`, `itr.grievance.read`).
- [x] **Backend:** `POST /auth/team/invite` now returns the one-time raw `token` (it was discarded before, contradicting the endpoint's own contract) so the mobile owner can build a shareable `snapaccount://invite/{token}` link.
- [x] **Mobile:** owner **Team** screen (members + pending invites + Invite form with role picker ORG_MEMBER/CA/MANAGER + Share invite link), surfaced under More for `business_owner` only. New `mobile/src/lib/team.ts` API client.
- [x] **Mobile:** invitee **AcceptInvite** flow — deep link `snapaccount://invite/{token}` (linking config in `RootNavigator`) + manual code entry + push (`notificationRouter` `org_invite`); validates token, accepts, **force-refreshes the session token** (new `refreshAccessToken()` in `api.ts`) to pick up the new org claims, then hydrates orgs into the store.
- [x] Reuses the existing fully-built backend invite/member infra (`CreateInvitation`/`AcceptInvitation`/`ValidateInviteToken`/`Revoke`/`Resend`, member CRUD, `org.members.*`) that already powers the admin-web Team page — Phase 2 was therefore almost entirely a **mobile** build + 3 small backend fixes.

**Acceptance constraint (by design, M1-R-002):** an invitee can only accept if their signed-in account's **email or phone matches the invitation**. Mobile is phone-first, so the invite form collects the invitee's phone (recommended) alongside the required email.

### Backlog (independent)
- [ ] **Admin:** Accounting review screen, or de-scope `accounting.*` servicing (Issue 6).
- [ ] **Backend (optional hardening):** also set `UserType` inside the social/password commands themselves (server-side), not only via the client onboarding call (Issue 3, defence-in-depth).
- [x] **Docs:** `SnapAccount_User_Hierarchy.md` refreshed to the implemented role model + clarified Employee definition (Issue 9).
