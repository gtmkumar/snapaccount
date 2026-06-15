---
name: Phase 7 compliance flows — KFS placement & DPDP Privacy Center API mapping
description: Where the RBI KFS screen sits in the loan flow, the kfsId handoff contract, and the DPDP Privacy Center → AuthService B7 endpoint mapping
type: project
---

Phase 7 Wave 2 (2026-06-10) added two compliance surfaces on mobile. Specs:
`docs/design/mobile/loans/key-facts-statement-screen.md` and `docs/design/mobile/privacy/privacy-center.md`.

**RBI Key Facts Statement (KFS) placement & handoff:**
- KFS screen slots BETWEEN `LoanPackagePreviewScreen` and `LoanConsentScreen` (i.e. before consent capture). Master Direction on Digital Lending 2025 requires KFS acknowledged before authorization.
- KFS payload is server-signed (HMAC) by backend B8; UI is read-only and shows a "verified" affordance + signature last-8 only (no key on device, client does NOT verify HMAC — trusts `verified:true` flag).
- Acknowledgement = TWO gates: scroll-to-bottom detection AND explicit checkbox, before "Continue to consent" enables (stricter than single checkbox; mirrors existing loan-consent scroll pattern).
- **kfsId handoff contract:** acknowledged `kfsId` is forwarded into `LoanConsentScreen` and MUST be included in `POST /loans/{appId}/consents` body (new `kfsId` field added to the existing consent submission). B8 rejects consent submissions whose kfsId wasn't acknowledged.
- This amends `loan-application-screen.md` "Preview unlock rule" to: all docs green → KFS acknowledged → consents signed.

**DPDP Privacy Center → backend B7 (AuthService) endpoint mapping:**
- List consents: `GET /auth/me/consents` (confirmed in B7).
- Withdraw consent (one-tap + confirm dialog explaining consequences): `POST /auth/me/consents/{purpose}/withdraw` (confirmed in B7).
- Data export (async job requested→processing→ready→expired/failed, signed-URL download): `GET /auth/me/data-export` (confirmed in B7).
- Correction request submit/list: `POST /auth/me/corrections` + `GET /auth/me/corrections` (PROPOSED — B7 names the workflow but not exact endpoints; open question for backend).
- DPO/grievance contact (DPDP Rules 2025, published India-based, admin-configurable): `GET /auth/config/privacy-contact` or embedded in consents envelope (PROPOSED — confirm source).
- Account deletion = links to EXISTING deletion flow (Profile Danger Zone / About screen 55); NOT respec'd. Robustness fix tracked under GAP-003 / backend B1.

**Why:** Unblocks mobile-dev M3 immediately after backend B7/B8. RBI (lending) + DPDP Act 2023 / Rules 2025 (privacy) are High-priority compliance gaps GAP-021 / GAP-020.
