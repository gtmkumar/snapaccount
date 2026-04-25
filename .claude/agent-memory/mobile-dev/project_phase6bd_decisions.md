---
name: Phase 6B+6D Architectural Decisions
description: Navigation patterns, missing packages, API contract gaps, and component choices made during Phase 6B (GST notices) and Phase 6D (ITR engine) implementation
type: project
---

Phase 6B+6D implementation complete as of 2026-04-25. 30+ files created/modified.

**Key decisions:**

- `expo-local-authentication` not installed — UserApprovalScreen uses `Alert.alert` dialog as biometric gate fallback. Production: install and replace.
- `expo-document-picker` not installed — EVerificationScreen and Form16UploadScreen use `expo-image-picker` (already at ~16.0.6) for all document selection. Production: install expo-document-picker for proper PDF selection.
- `react-native-chart-kit` not confirmed installed — ProgressRing and RegimeBarChart are pure RN implementations (border-color transparency arc; proportional View bars). No SVG/chart dependency.
- GstNoticeDetailScreen created as required companion to GstNoticeInbox — TypeScript navigation param type safety demands its own screen for `{ noticeId: string }` params.
- Wizard non-blocking mutation pattern: `try { await updateMutation.mutateAsync() } catch {}` — wizard proceeds even on backend failure (offline resilience).

**API contract gaps (not in docs/api/endpoints.md):**
- `GET /itr/doc-checklist?assesseeId&filingId` — used by DocChecklistScreen
- `POST /itr/grievances` — used by RaiseGrievanceModal / RefundTrackerScreen

**Navigation structure:**
- ItrStack: ItrDashboard → EmployeeProfileWizard → DocChecklist → Form16Upload → RegimeComparison → FilingSummary → UserApproval → EVerification → RefundTracker → ItrNoticeInbox → ItrNoticeDetail
- GstStack extended: added GstNoticeInbox, GstNoticeDetail, GstNilReturnConfirm

**Test baseline after 6B+6D:** 14 suites / 66 tests (up from 10 / 50)

**Pre-existing type errors (not introduced by 6B+6D):**
- FirebaseAuthTypes namespace errors in AuthNavigator, OTPVerifyScreen, PhoneEntryScreen
- `[never, never]` errors in OTPVerifyScreen, PermissionRequestsScreen, SplashScreen
- MoreScreen navigation overload error

**Why:** Document the workarounds so future phases don't rediscover the missing packages.
**How to apply:** When adding biometric gates or PDF upload in new screens, check if `expo-local-authentication` and `expo-document-picker` have been added to package.json before using. If not, flag as contract gap rather than silently substituting.
