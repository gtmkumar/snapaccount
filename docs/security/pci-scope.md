# SnapAccount PCI-DSS Scope Statement

> **Classification:** INTERNAL — Restricted  
> **Author:** security-reviewer agent  
> **Date:** 2026-06-11  
> **Branch:** 2026-06-10-s5t4  
> **PCI-DSS Version:** v4.0.1  
> **Target SAQ type:** SAQ A (Card-not-present, fully outsourced)

---

## 1. Payment Architecture — How Razorpay Is Used

SnapAccount uses **Razorpay** as its sole payment processor for subscription billing. The integration is server-initiated (not a client-embedded SDK):

1. **Order/subscription creation** — `SubscriptionService` calls the Razorpay REST API (`https://api.razorpay.com/v1/`) to create an order or subscription object. The response is a Razorpay-managed identifier (e.g. `sub_XXXX`, `order_XXXX`). No card data is involved at this step.  
   - File: `backend/Services/SubscriptionService/SubscriptionService.Infrastructure/Razorpay/RazorpayHttpClient.cs`

2. **Checkout** — The mobile `BillingScreen` and admin `PaymentGatewaySettings` display subscription plans and pricing. There is **no in-app card-entry form**. No Razorpay JavaScript SDK (Checkout.js) or React Native Razorpay SDK is embedded in the mobile app or admin frontend.  
   - Verified: `mobile/package.json` — no `react-native-razorpay` or equivalent dependency.  
   - Verified: `src/admin/package.json` — no Razorpay JavaScript SDK dependency.  
   - Verified: `mobile/src/screens/profile/BillingScreen.tsx` — screen shows current plan and invoice history only; upgrade CTA is a placeholder pending live credentials (header comment: "backend mid-fix").

3. **Payment completion** — Razorpay Hosted Checkout (web redirect or Razorpay-managed WebView) handles all card-entry, authentication (3DS), and payment authorization entirely within Razorpay's PCI-compliant environment.

4. **Webhook notification** — Razorpay posts `subscription.charged` / `subscription.cancelled` events to `POST /subscriptions/webhooks/razorpay`. This endpoint receives Razorpay's event payload (subscription ID, payment ID, amount in paise). It **never receives card data**.  
   - File: `backend/Services/SubscriptionService/SubscriptionService.Api/Endpoints/RazorpayWebhook.cs`

5. **Credential storage** — Razorpay API key ID (`rzp_live_*` / `rzp_test_*`) is stored in plaintext in the `subscription.razorpay_config` table. The API key **secret** and the webhook **signing secret** are stored AES-256-GCM encrypted at rest using `AesCredentialEncryptionService`.  
   - File: `backend/Services/SubscriptionService/SubscriptionService.Infrastructure/Services/AesCredentialEncryptionService.cs`  
   - File: `backend/Services/SubscriptionService/SubscriptionService.Domain/Entities/RazorpayConfig.cs`

---

## 2. Cardholder Data Environment (CDE) Boundary

SnapAccount **does not** enter, process, transmit, or store any of the following:

| PCI-DSS Data Element | Status in SnapAccount |
|---|---|
| Primary Account Number (card PAN — 16-digit) | NOT PRESENT. "PAN" in the codebase refers exclusively to Income Tax Permanent Account Number (Indian tax ID), not payment card numbers. |
| Card Verification Value (CVV/CVC/CVC2) | NOT PRESENT |
| Cardholder name | NOT PRESENT |
| Card expiry date | NOT PRESENT |
| Magnetic stripe / chip data | NOT PRESENT |
| PIN / PIN block | NOT PRESENT |

**Note on terminology:** The codebase contains many references to "PAN" (e.g., `AesPanEncryptionService`, `PanNumber` value object). These all refer to **Indian Income Tax PAN** (format XXXXX9999X), which is not a payment card number and is outside PCI-DSS scope. The encrypted storage for IT PAN is a separate, DPDP Act 2023 control.

Verified by:
- Grepping `card.*number|credit.*card|debit.*card|cvv|cvc|expir` across all backend `.cs` files (excluding `/obj/` and `/bin/`) — no results relating to payment card data.
- No card input fields in `mobile/src/` or `src/admin/src/` (no `secureTextEntry` fields labeled as card number, CVV, or expiry).
- Razorpay JavaScript SDK not loaded in admin frontend; React Native Razorpay SDK not in `mobile/package.json`.

---

## 3. SAQ A Eligibility Assessment

**Target questionnaire: SAQ A** (Merchants using fully hosted payment pages — card data captured, processed, and stored entirely by the payment processor).

### SAQ A Requirements and Guardrails

| SAQ A Requirement | Guardrail in SnapAccount | Status |
|---|---|---|
| 2.2 — No default credentials | Razorpay credentials admin-configured via PATCH `/subscriptions/config/razorpay`, protected by `subscription.config.write` RBAC permission. No hardcoded credentials. | PASS |
| 4.2.1 — PAN transmitted over strong cryptography | SnapAccount never transmits card PAN. Razorpay API calls use HTTPS (TLS 1.2+) via `HttpClient` with `BaseAddress = https://api.razorpay.com/v1/`. | PASS |
| 6.3.2 — Software inventory and patch management | Razorpay HTTP client library is standard `System.Net.Http`. No Razorpay native SDK requiring independent patch tracking. | PASS |
| 6.4.2 — Web-facing application security (if applicable) | No card data enters SnapAccount web surfaces. Razorpay-hosted checkout is served from Razorpay's domain. CSP controls documented in `src/admin/nginx.conf`. | PASS |
| 8.2 — User identification and authentication | Razorpay API credentials protected behind Firebase Auth + RBAC (`subscription.config.write`). Admin credentials managed via `AesCredentialEncryptionService` (AES-256-GCM). | PASS |
| 9.x — Physical security | Cloud Run / GCP-hosted; no physical point-of-sale devices. Physical security delegated to Google. | PASS (Google responsible) |
| 11.3 — Vulnerability scans | Tracked in VAPT plan (`docs/security/vapt-plan.md`). | PLANNED |
| 12.8 — Third-party service provider (TPSP) management | Razorpay holds PCI-DSS Level 1 certification. Must be confirmed and tracked annually. | CONDITIONAL — see §4 |

---

## 4. What Would Break SAQ A Eligibility

The following changes or gaps would cause SnapAccount to exit SAQ A eligibility:

| Risk | Trigger | Impact |
|---|---|---|
| **In-app card capture** | Adding a card number, CVV, or expiry input field in mobile or admin frontend | Would require SAQ A-EP or SAQ D — full CDE assessment |
| **Razorpay SDK embedded with direct API call** | Adding `react-native-razorpay` or Checkout.js that calls Razorpay token APIs while card data is in-scope to our JavaScript context | SAQ A-EP at minimum |
| **Logging payment objects** | Logging raw Razorpay webhook payloads that include card-type metadata, BIN data, or card fingerprints | PCI-DSS Requirement 3; would require data-at-rest controls |
| **Storing Razorpay payment IDs in unprotected columns** | `razorpay_invoice_id` column in `subscription.subscription_invoice` stores Razorpay payment IDs — these are not card data but must not be logged alongside any card metadata | Low risk today; monitor |
| **Razorpay credentials in plaintext** | Storing `key_secret` or `webhook_secret` without encryption | Requirement 8.2; currently mitigated by AES-256-GCM |
| **Webhook endpoint without HMAC verification** | Removing or bypassing `VerifyHmac()` in `RazorpayWebhook.cs` | Allows spoofed webhook events that could fraudulently mark subscriptions as paid |
| **Razorpay TPSP certification lapses** | Razorpay's PCI-DSS Level 1 certification expires unnoticed | Requirement 12.8.4 — annual review required |
| **MockRazorpayClient in production** | `DependencyInjection.cs` line 64 registers `MockRazorpayClient` as `IRazorpayClient` by default; if `UpdateRazorpayConfig` is never called in production, the mock remains active | Not a PCI scope violation (no card data) but a billing reliability risk; add a startup check |

---

## 5. Known Gaps and Conditions

### GAP-PCI-01 (LOW) — `IRazorpayClient.VerifyWebhookSignature` uses non-constant-time comparison

**File:** `backend/Services/SubscriptionService/SubscriptionService.Infrastructure/Razorpay/RazorpayHttpClient.cs`, line 159  
**Description:** The production `RazorpayHttpClient.VerifyWebhookSignature` method compares HMAC signatures using `string.Equals(computed64, signature, StringComparison.OrdinalIgnoreCase)`, which is not constant-time. However, **this method is not called from any production code path** — the webhook endpoint (`RazorpayWebhook.cs`) uses its own private static `VerifyHmac()` method that correctly uses `CryptographicOperations.FixedTimeEquals`. This is dead code with a dangerous implementation that could be accidentally promoted.  
**Risk:** If a future refactor routes the webhook through `IRazorpayClient.VerifyWebhookSignature`, timing attacks become possible.  
**Recommended Fix:** Remove `VerifyWebhookSignature` from `IRazorpayClient` interface and both implementations. Signature verification is a transport-layer concern that belongs only in the endpoint.

### GAP-PCI-02 (LOW) — No startup guard preventing MockRazorpayClient in production

**File:** `backend/Services/SubscriptionService/SubscriptionService.Infrastructure/DependencyInjection.cs`, line 64  
**Description:** `MockRazorpayClient` is registered unconditionally as the `IRazorpayClient` implementation. The real client is only registered lazily when `UpdateRazorpayConfig` is called. There is no startup validation that fails the service if a live-mode config row is absent in production, similar to the guard pattern used for `ENCRYPTION_KEY` in `AesCredentialEncryptionService`.  
**Risk:** Production deployment with mock client would silently succeed all subscription operations without processing real payments.  
**Recommended Fix:** On startup in non-Development environments, check if a `RazorpayConfig` row exists with `IsEnabled = true` and `TestMode = false`. Log a WARNING if absent. For hard enforcement, consider a health check endpoint.

### GAP-PCI-03 (INFO) — `PaymentGatewaySettings.tsx` save button is not wired to API

**File:** `src/admin/src/pages/settings/sections/PaymentGatewaySettings.tsx`, line 247  
**Description:** The "Save Payment Settings" button shows `toast.success('Payment settings saved (local only — API endpoint pending)')` — it does not call `PATCH /subscriptions/config/razorpay`. This means an admin cannot configure live Razorpay credentials through the UI. The backend endpoint exists and is secured.  
**Risk:** Operational — live mode cannot be enabled without direct API calls. Tracked as GAP-035/GAP-036 in the wave6 triage.  
**Note:** This was already known and delegated to `frontend-dev` (Batch F, wave6 triage). Recording here for PCI completeness.

### GAP-PCI-04 (INFO) — Razorpay TPSP annual certification review not yet documented

**Description:** PCI-DSS v4.0 Requirement 12.8.4 mandates that the organization maintain a record of each TPSP's PCI-DSS compliance status (annually). Razorpay holds PCI-DSS Level 1 certification (confirmed via public Razorpay compliance documentation). A formal review record and TPSP register must be established before the first production billing transaction.  
**Recommended Fix:** DevOps/Compliance team to establish a TPSP register in `docs/compliance/` with Razorpay's current AOC (Attestation of Compliance) reference and annual review date.

---

## 6. Webhook Security Verification

The webhook endpoint security chain is verified correct:

| Step | Implementation | File | Line |
|---|---|---|---|
| Raw body read before binding | `EnableBuffering()` + `StreamReader` | `RazorpayWebhook.cs` | 45–49 |
| Signature header present check | 401 if `X-Razorpay-Signature` missing | `RazorpayWebhook.cs` | 52–58 |
| Secret configured check | 503 if `RAZORPAY_WEBHOOK_SECRET` absent (fail-closed) | `RazorpayWebhook.cs` | 60–67 |
| HMAC-SHA256 verification | `CryptographicOperations.FixedTimeEquals` on UTF-8 hex bytes | `RazorpayWebhook.cs` | 116–140 |
| Idempotency deduplication | `IDistributedCache` keyed on `X-Razorpay-Event-Id`, TTL 24h | `RazorpayWebhook.cs` | 77–93 |
| Event body size limit | `MaximumLength(65536)` in `HandleRazorpayWebhookCommandValidator` | `HandleRazorpayWebhookCommand.cs` | 28 |
| Rate limiting | Standard rate limiter applied at service level | `SubscriptionService.Api/Program.cs` | — |

**Note:** `VerifyHmac` compares UTF-8 bytes of hex strings (both sides lowercased), not decoded binary bytes. This is functionally correct and constant-time, but deviates from the standard pattern of comparing decoded byte arrays. It was previously flagged as NEW-001 (MEDIUM) in Phase 5. If `CryptographicOperations.FixedTimeEquals` is called on equal-length hex strings this is not exploitable, but a malformed (non-hex) signature in the header would need the `try/catch` at line 137 to handle `Convert.FromHexString` failures — the current code catches all exceptions and returns `false`, which is correct.

---

## 7. Summary

SnapAccount qualifies for **SAQ A** posture because:

- All card data capture and processing is handled exclusively by Razorpay's hosted environment.
- No card data enters, transits, or is stored within SnapAccount's systems.
- The Razorpay integration is server-to-server (API keys + webhooks only); no card-entry SDK is embedded in the mobile app or admin frontend.
- Webhook authenticity is verified with HMAC-SHA256 using constant-time comparison.
- Razorpay API secrets are encrypted at rest (AES-256-GCM).

**Conditions for maintaining SAQ A:** (1) Never add in-app card entry fields; (2) Never embed Razorpay checkout SDK in-scope JavaScript; (3) Establish and maintain annual Razorpay TPSP certification review; (4) Address GAP-PCI-01 (remove dead `VerifyWebhookSignature` from interface) and GAP-PCI-02 (startup guard for production mode) before go-live.

---

*Last reviewed: 2026-06-11*  
*Next review: Before first live billing transaction, then annually.*
