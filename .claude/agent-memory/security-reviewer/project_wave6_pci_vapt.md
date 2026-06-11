---
name: project-wave6-pci-vapt
description: Wave 6 security review 2026-06-11 — PCI-DSS SAQ A boundary verified; VAPT plan written; 2 LOW + 3 INFO findings; GO verdict
metadata:
  type: project
---

Wave 6 PCI scope (GAP-106) and VAPT plan (GAP-025) completed 2026-06-11.

**Why:** Orchestrator wave6 triage delegated both tasks to security-reviewer (Batch S).

**How to apply:** Do not re-flag the SAQ A boundary as unknown — it is verified. Do not re-flag the dead `VerifyWebhookSignature` on IRazorpayClient unless it is called from production code.

## PCI-DSS SAQ A Boundary (Confirmed)

- SnapAccount qualifies for SAQ A. No card-entry form in mobile or admin. No Razorpay JS/RN SDK embedded. Razorpay integration is server-to-server (API key + webhook) only.
- "PAN" in codebase = Indian Income Tax PAN (XXXXX9999X), NOT payment card PAN. These are separate data sets with separate encryption controls.
- Verified: `mobile/package.json` has no `react-native-razorpay`. `src/admin/package.json` has no Razorpay JS SDK.
- Webhook HMAC-SHA256 + FixedTimeEquals verified correct in `RazorpayWebhook.cs`.
- API key secret stored AES-256-GCM encrypted in `subscription.razorpay_config.encrypted_key_secret`.

## Open Findings from Wave 6

- **GAP-PCI-01 (LOW):** `IRazorpayClient.VerifyWebhookSignature` uses `string.Equals` (non-constant-time) in `RazorpayHttpClient.cs:159`. Dead code — not called from any production path. Fix: remove from interface.
- **GAP-PCI-02 (LOW):** No startup guard preventing `MockRazorpayClient` in production. `DependencyInjection.cs:64` registers mock unconditionally. Fix: startup check or health probe.
- **GAP-PCI-03 (INFO):** Admin `PaymentGatewaySettings.tsx` save button is a toast stub, not wired to API. Backend endpoint exists and is secured. Frontend-dev task (Batch F Wave 6).
- **GAP-PCI-04 (INFO):** No TPSP register for Razorpay PCI certification. Need `docs/compliance/tpsp-register.md`.
- **GAP-PCI-05 (INFO):** Webhook VerifyHmac compares hex string bytes not decoded bytes (prior NEW-001 MEDIUM from Phase 5 — still deferred).

## VAPT Plan

- Written to `docs/security/vapt-plan.md`.
- 12 prioritized test targets (T-01 through T-12), OWASP ASVS v4 Level 2 + MASVS v2 mapped.
- High-priority targets: auth bypass (T-01), cross-org IDOR (T-02), RBAC enforcement (T-03), AI prompt injection (T-04), webhook integrity (T-05).
- Prior open findings mapped to VAPT test targets for re-verification.
- Regulatory basis: RBI IT Framework (6-monthly), CERT-In, DPDP Act 2023 §8, PCI-DSS Req 11.3.

Related: [[project_phase6f_patterns]], [[project_ai_service_p7a_final_gate]]
