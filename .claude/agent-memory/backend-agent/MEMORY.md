# Backend Agent Memory Index

- [Project Stack & GCP Cloud](project_stack.md) — GCP/Firebase/Aspire stack decisions, NOT Azure
- [Security Fixes Phase 5](project_security_phase5.md) — All SEC-* fixes applied, build status, patterns used
- [Auth Architecture](project_auth_architecture.md) — Firebase auth, OTP, device binding, RBAC, PAN encryption patterns
- [JT Clean Architecture Refactor](jt_refactor.md) — Repository layer, pipeline behaviors, shared DI, CurrentUser consolidation
- [JT Structural Refactor (2026-04-07)](../../../backend/.claude/agent-memory/backend-agent/jt_refactor.md) — Full endpoint group migration, BaseAuditableEntity split, Shared.Api project, 50 projects 0 errors
- [Phase 6A+6E+6B+6D Backend Build](project_phase6_backend.md) — All 4 phases complete: GstService (26 endpoints, adapters), ItrService (17 endpoints, tax engine), 213 tests passing
- [Phase 6 Security Hotfix (SEC-026..029)](project_security_phase6_hotfix.md) — PermissionBehavior DI fix, DPDP erasure subscribers, DLQ gate, IDOR org-scoping on 8 handlers
- [Phase 6B+6D Security Hotfix (SEC-038..043)](project_security_phase6b6d_hotfix.md) — GST notice IDOR, ITR filing IDOR (10 handlers), DPDP subscribers for Gst+Itr, rate-limit tightening. 240 tests pass.
- [Phase 6C Backend Build](project_phase6c_backend.md) — LoanService/ReportService/NotificationService; SEC-044/046/047/049 hotfix included; 313 tests passing
- [Phase 6F Backend Build (FINAL)](project_phase6f_backend.md) — ChatService (16 ep) + SubscriptionService (13 ep) full builds; 375 tests passing; 0 501 stubs remain
- [Phase 6F Security Hotfix (SEC-051..053/056)](project_security_hotfix_sec051_056.md) — Razorpay HMAC webhook, DPDP erasure for SubscriptionService, ChatService rate-limit. 391 tests.
- [Auth/RBAC Module 1](project_auth_rbac_module1.md) — Org roles CRUD, permission matrix, delegation rule, invitations, RLS fix (SEC-RLS-001). 120 tests pass.
- [Tasks #17/#18/#19 — 2FA/PwReset/KYC](project_tasks_17_18_19.md) — TOTP enroll/confirm/disable/challenge; password forgot/reset; KYC PAN+Aadhaar mock. 347 tests pass.
- [Task #22 — Social Firebase Sign-In](project_task22_social_firebase.md) — POST /auth/social/firebase (Google/Apple); FirebaseTokenClaims DTO; IFirebaseAuthService extended; 367 tests pass.
- [Task #24 — Gov Verification + Documents (Part A+B)](project_task24_gov_verification_documents.md) — Org toggle, 5 new endpoints, TanNumber VO, MockDocumentVerificationProvider (dual interface). 444 tests pass.
