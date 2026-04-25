---
name: Phase 6F Security Hotfix (SEC-051..053/056)
description: Razorpay HMAC webhook restored, DPDP subscriber for SubscriptionService, ChatService rate-limiting hardened. 391 tests passing.
type: project
---

Phase 6F security hotfix applied 2026-04-25.

**Why:** security-reviewer found 1 HIGH + 3 MED regressions in SubscriptionService and ChatService.

**How to apply:** These fixes are live in main branch. All 391 tests green, 0 errors/warnings.

## SEC-051 (HIGH) — Razorpay HMAC webhook FIXED

New endpoint: `POST /subscriptions/webhooks/razorpay`
- File: `SubscriptionService.Api/Endpoints/RazorpayWebhook.cs`
- Reads raw body before model-binding via `EnableBuffering()`
- HMAC-SHA256 with `CryptographicOperations.FixedTimeEquals` (constant-time, timing-attack safe)
- Secret from `RAZORPAY_WEBHOOK_SECRET` config key
- Idempotency: `X-Razorpay-Event-Id` deduplicated via Redis IDistributedCache (TTL 24h), key: `rzp:webhook:dedupe:{eventId}`
- Application handler: `HandleRazorpayWebhookCommand` in `SubscriptionService.Application/Webhooks/Commands/HandleRazorpayWebhook/`
- Handles: `subscription.charged` (renew + invoice), `subscription.cancelled` (cancel sub), unknown events (silent ack)
- `.AllowAnonymous()` — webhook is server-to-server, no Firebase JWT
- Redis added to SubscriptionService.Api.csproj and Infrastructure via `AddStackExchangeRedisCache`

## SEC-052 (MEDIUM) — SubscriptionService DPDP erasure FIXED

New file: `SubscriptionService.Infrastructure/Messaging/AccountDeletionSubscriber.cs`
- Mirrors ChatService pattern; subscribes to `account-deletion-events` Pub/Sub
- Default sub ID: `subscription-service-account-deletion-sub` (override via `PUBSUB_SUBSCRIPTION_ACCOUNT_DELETION`)
- On erasure: `sub.Anonymize()` + `inv.Anonymize()` — sets OrganizationId=Guid.Empty, AnonymizedAt, AnonymizationReason
- Does NOT hard-delete (RBI compliance 7-year retention)
- Domain methods added: `Subscription.Anonymize()`, `Invoice.Anonymize()`
- Registered: `AddHostedService<AccountDeletionSubscriber>()` in DI
- Google.Cloud.PubSub.V1 added to Infrastructure.csproj

## SEC-053 (MEDIUM) — ChatService SendMessage rate-limit FIXED

ChatService.Api/Program.cs:
- Added `chat-send-strict` fixed-window limiter: 60 msg/min, queue limit 0
- `POST /chat/threads/{id}/messages` now uses `.RequireRateLimiting("chat-send-strict")`

ChatHub.cs (SignalR):
- New `SendMessage(threadId, body, clientMessageId?)` hub method
- Redis IDistributedCache (already wired via StackExchangeRedis) rate check
- Key: `chat:rate:{userId}:{minuteBucket}` (bucket = unixtime/60), INCR pattern, TTL 2 min
- Max 60 msg/min per user — excess sends `Clients.Caller.SendAsync("Error", "Rate limit exceeded...")`
- Delegates to same `SendMessageCommand` as REST endpoint
- Emits `MessageAck` to caller on success
- IDistributedCache registered via `AddStackExchangeRedisCache` in ChatService DI

## SEC-056 (LOW) — Settings endpoint gap analysis (OPEN)

Admin frontend `settingsApi.ts` calls these endpoints:
- `GET/PUT /notifications/preferences` — EXISTS in NotificationService
- `PATCH /auth/me/preferences` — MISSING (AuthService has no PATCH me/preferences endpoint)
- `GET/PATCH /auth/org/settings` — MISSING (AuthService has no org/settings endpoint)
- `GET/PATCH /auth/config/ai` — MISSING
- `GET/PATCH /auth/feature-flags` — MISSING
- `PATCH /auth/feature-flags/{flag}` — MISSING
- `GET/PATCH /auth/config/language` — MISSING
- `GET/PATCH /auth/config/whatsapp` — MISSING

**5 ghost endpoint groups in AuthService** (org/settings, config/ai, feature-flags, config/language, config/whatsapp) + 1 in AuthService (me/preferences).

Frontend-dev needs to either: (a) add stub 404-tolerant fallbacks in settingsApi.ts, or (b) request Phase 7 backend work to scaffold these 6 endpoint groups.

## Test delta

391 total tests (was 375):
- SubscriptionService: 45 tests (was 29) — +16 webhook/DPDP unit tests in RazorpayWebhookTests.cs
- All other services unchanged
