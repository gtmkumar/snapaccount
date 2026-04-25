---
name: Phase 6F Security Patterns and Architectural Decisions
description: New attack surface from Chat/SignalR, SubscriptionService rebuild regression, SignalR auth gap, settings ghost endpoints; Phase 6F NO-GO then GO after hotfixes; final Phase 6 gate result
type: project
---

## SEC-051 Regression: Razorpay Webhook HMAC Eliminated — FIXED in 6F hotfix

The SubscriptionService was rebuilt in Phase 6F from stub to full implementation. In this rebuild, the Razorpay webhook endpoint (and SEC-001 HMAC fix) was not carried forward. Fixed in 6F hotfix: dedicated `POST /subscriptions/webhooks/razorpay` endpoint restored with AllowAnonymous, EnableBuffering, HMAC-SHA256 via CryptographicOperations.FixedTimeEquals, Redis idempotency via X-Razorpay-Event-Id (24h TTL).

**Why:** Backend-agent rebuilt SubscriptionService fresh and omitted the unauthenticated webhook + HMAC pattern. The RecordPayment command docstring falsely claims "SEC-001 HMAC verified" — comment/code mismatch pattern (same as Phase 5 NEW-002).

**How to apply:** On any service with a payment webhook, verify: (1) there is a dedicated unauthenticated endpoint for the webhook provider, (2) it performs HMAC before dispatching internal commands, (3) the command docstring matches actual verification status.

---

## ChatService Security Posture (PASS areas — confirmed in both 6F and 6F re-audit)

- PermissionBehavior correctly registered; [RequiresPermission] on assign/resolve/escalate
- SignalR hub: [Authorize] + JoinThread participant check via DB query before AddToGroupAsync
- All sampled handlers apply org-scoped EF filter + Error.NotFound
- AccountDeletionSubscriber correct: anonymize sender_user_id, soft-delete ThreadParticipants
- BEFORE DELETE triggers in migration 029 confirmed for chat.messages + chat.threads
- SendMessage idempotency via (thread_id, client_message_id) UNIQUE constraint confirmed
- SearchHistory org-scoped via Join + OrganizationId filter
- chat-send-strict policy (60/min) confirmed on REST POST /chat/threads/{id}/messages
- SignalR hub Redis INCR rate check: `rate:{userId}:{minuteBucket}` — note: missing `chat:` prefix (INFO-006)

---

## SignalR Hub Rate Limiting — Partially Fixed in 6F hotfix

ChatHub.cs implements Redis INCR pattern for SendMessage: key `rate:{userId}:{minuteBucket}` (TTL 2 min), cap 60/min. Fixed SEC-053. However:
- Key is missing `chat:` namespace prefix (document says `chat:rate:{userId}:{minute}` but code has `rate:{userId}:{minuteBucket}`) — INFO-006, tracked for Phase 7.
- JoinThread and Heartbeat hub methods still have no rate limit — INFO-005 from original 6F review, deferred to Phase 7 IHubFilter.

---

## Mobile Firebase Dev Mock Pattern

`mobile/src/lib/firebase.ts` is an Expo Go compatible mock returning 'mock-id-token'. The SEC-054 fix correctly calls `FirebaseAuth.getIdToken()` but in dev builds this returns the mock token. Production builds must replace this file with `@react-native-firebase/auth` — tracked as INFO-007. Same category as placeholder cert hashes (INFO-001): infrastructure pre-production requirement, not a code change.

---

## Settings Ghost Endpoints (Admin → Backend disconnect) — SEC-056 deferred Phase 7

Admin settingsApi.ts calls 11 PATCH endpoints that do not exist in any backend service. Deferred as P6-HANDOFF-36 to Phase 7. When implemented, must have [RequiresPermission("admin.settings.*")] — never ship a settings write endpoint without a permission gate.

---

## All 3 Persistent Deferred Findings — FIXED in 6F hotfix

- SEC-045: PayloadViewer OAuth masking — CONFIRMED-FIXED (strips access_token/refresh_token/id_token/client_secret; renders Bearer ***{last6} only)
- SEC-048: Real biometric (expo-local-authentication) — CONFIRMED-FIXED (3 screens: LoanConsent, LoanPackagePreview view+submit, UserApproval)
- SEC-034/SEC-055: UUID deep-link validation — CONFIRMED-FIXED (isValidUuid() on all 6 id-param routes)

**Pattern:** After 3 consecutive phases deferred, mark as production blocker in the Go/No-Go recommendation regardless of "medium" severity. This worked — all 3 were fixed after the NO-GO.

---

## Phase 6F Final Go/No-Go: GO (after hotfixes)

8 findings confirmed fixed (1 HIGH + 7 MEDIUM). 0 new HIGH/MEDIUM/LOW findings. 2 INFO observations (Redis key prefix, Firebase mock module).

**Pre-production blockers (not Phase 6 gate blockers):**
- NEW-002 (HIGH): Firebase revocation failure makes account deletion non-atomic. Phase 7.
- SEC-041 (MEDIUM): Client PAN cipher in ItrService. Phase 7 before Form 16 launch.
- INFO-001: Placeholder cert hashes. DevOps must replace before prod build.
- INFO-007: Firebase mock module. Mobile-dev must swap for real @react-native-firebase/auth before prod build.
- P6-HANDOFF-25: GET /loans/consents/catalog endpoint. Backend-agent Phase 7.

---

## Confirmed Security Controls as of Phase 6F Final Gate

- All 56 SEC findings tracked in final status table in security-report.md (Phase 6F Re-audit section)
- RLS confirmed on auth.users, chat.*, callback.*, notification.* tables
- DPDP erasure cascade confirmed: Auth + Callback + Notification + Chat + Subscription + Gst + Itr services all have AccountDeletionSubscriber
- Razorpay HMAC webhook: CONFIRMED present in SubscriptionService (SEC-051 hotfix)
- ChatService rate limiting: REST 60/min (chat-send-strict) + SignalR Redis INCR 60/min
- All mobile deep-links UUID-validated via isValidUuid()
- PayloadViewer: no raw OAuth token display
- Real biometric on all 3 financial commitment screens (loan consent, loan preview, ITR approval)
