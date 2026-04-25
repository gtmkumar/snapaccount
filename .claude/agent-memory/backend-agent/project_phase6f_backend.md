---
name: Phase 6F Backend Build
description: Final phase — ChatService full build, SubscriptionService full build, ReportService share-link, cross-cutting endpoints. 375 tests passing.
type: project
---

Phase 6F is the final backend phase. All services now have zero 501 stubs.

**Why:** Completes all 11 microservices to production-ready state for staging deploy.

**How to apply:** No further Phase N scope work needed. Future work is bug fixes, performance tuning, and post-launch features.

## Deliverables completed

### ChatService (was 0% → 100%)
- Full domain: ChatThread aggregate (state machine OPEN/PENDING_USER/RESOLVED/ESCALATED/REOPENED), ChatMessage (DPDP anonymization + offline idempotency), ThreadParticipant, ReadReceipt, RoutingRule
- 10 commands + 5 queries — all handlers wired
- SignalR ChatHub at `/hubs/chat` with JWT auth, participant validation, group-per-thread
- Redis presence service (30s TTL)
- RoutingRuleEngine (startup-cached)
- AccountDeletionSubscriber (DPDP Pub/Sub)
- 16 REST endpoints at `/chat/threads/*`
- 33 unit tests passing

### SubscriptionService (was 0% → 100%)
- Domain: Plan, Subscription (state machine TRIALING→ACTIVE→PAST_DUE→CANCELLED|PAUSED), Invoice
- 8 commands + 4 queries — all handlers wired
- GST 18% on SaaS invoices (decimal, never float)
- Razorpay webhook handler (SEC-001 HMAC verified)
- 13 REST endpoints at `/subscriptions/*`
- 29 unit tests passing

### ReportService — share-link addition
- POST /reports/{id}/share-link — 15-min signed GCS URL (SEC-046 compliant)

### AuthService cross-cutting
- GET /auth/me/permissions — returns roles + permissions for current user
- GET /search — CommandPalette aggregator (users + orgs from auth schema; cross-service Phase 7)

### NotificationService — celebration tracking
- POST /notifications/celebrations/{kind}/fire — idempotent per user×kind
- GET /notifications/celebrations — returns fired state of all 5 kinds
- Storage: reuses notification.notification_log (no new migration)

## Build status
- `dotnet build` — 0 errors, 0 warnings
- Total unit tests: 375 (313 existing + 33 ChatService + 29 SubscriptionService)
- All 375 passing

## Key patterns used

### ChatService idempotency
```
if (!string.IsNullOrEmpty(request.ClientMessageId))
{
    var existing = await db.Messages.Where(m =>
        m.ThreadId == request.ThreadId && m.ClientMessageId == request.ClientMessageId
        && m.DeletedAt == null).FirstOrDefaultAsync(ct);
    if (existing != null) return ToResponse(existing);
}
```
UNIQUE constraint on (thread_id, client_message_id) in EF config.

### SearchHistoryQuery FTS
Used `x.Message.Body.ToLower().Contains(searchTerm)` in Application layer (EF Core base package only — no Npgsql in Application layer). Translates to ILIKE at runtime via Npgsql provider.

### GlobalSearchQuery (AuthService)
Used `Contains(q)` instead of `EF.Functions.ILike()` — AuthService.Application has no Npgsql reference.

### SubscriptionService MRR
```
var totalMrr = activeSubs.Where(s => s.Status == Active)
    .Sum(s => s.Plan.PriceInr / (int)s.Plan.BillingCycle);
```
BillingCycle enum values are 1/3/12 matching monthly divisor.

## AppHost wiring added
- ChatService: GCP_PROJECT_ID + PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION env vars
- SubscriptionService: GCP_PROJECT_ID env var
- Redis reference was already present for both services

## Enum naming (important for tests)
- ThreadCategory: GST, ITR, DOC, LOAN, BILLING, GENERAL (all uppercase)
- ParticipantRole: User, Agent, CA, LoanOfficer, Bot (mixed case — CA is uppercase)
- ThreadStatus: Open, PendingUser, Resolved, Escalated, Reopened

## Test projects created
- `/Users/gtmkumar/Documents/source/snapaccount/tests/unit/ChatService/`
- `/Users/gtmkumar/Documents/source/snapaccount/tests/unit/SubscriptionService/`
