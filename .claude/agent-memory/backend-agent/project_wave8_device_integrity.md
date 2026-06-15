---
name: project-wave8-device-integrity
description: Wave 8 backend: GAP-064 device integrity attestation (AuthService) + BUG-W7-IOS-001 ChatService SignalR hub 404 fix
metadata:
  type: project
---

Phase 7 Wave 8 completed on branch 2026-06-10-s5t4.

## GAP-064: Device Integrity Attestation

**Why:** 2026 fintech baseline — bots/emulators were driving OTP and loan flows.

**Architecture:**
- `IDeviceIntegrityVerifier` interface in Application/Interfaces
- `MockDeviceIntegrityVerifier` — default; "mock-fail" sentinel → FAIL; "mock-skip"/absent → SKIPPED; any other → PASS
- `PlayIntegrityVerifier` — credential-gated stub; returns NotConfigured when `DeviceIntegrity:PlayIntegrity:ServiceAccountJson+PackageName` absent
- `AppAttestVerifier` — credential-gated stub; returns NotConfigured when `DeviceIntegrity:AppAttest:TeamId+BundleId` absent
- `DeviceIntegrityMiddleware` — runs after FirebaseAuthMiddleware in AuthService; records telemetry regardless of verdict; only blocks when Enforce=true + FAIL
- `DeviceIntegrityCheck` entity → `auth.device_integrity_checks` table (migration 089)
- Provider switch: `DeviceIntegrity:Provider` config key (mock|play_integrity|app_attest)
- Soft-launch: `DeviceIntegrity:Enforce=false` default (set true to block FAIL in production)
- `DeviceIntegrity:RequireToken=false` (set true to block absent headers in enforce mode)

**Telemetry:** All checks written to `auth.device_integrity_checks` — never blocks on write failure.

**Gated endpoints:** /auth/otp/send, /auth/otp/verify, /auth/password/login, /auth/social/firebase (configurable via DeviceIntegrity:CheckedEndpoints).

**Migration 089 SQL:**
```sql
CREATE TABLE auth.device_integrity_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.user(id) ON DELETE SET NULL,
    organization_id UUID,
    platform VARCHAR(20),
    verdict VARCHAR(20) NOT NULL,
    endpoint VARCHAR(256) NOT NULL,
    failure_reason VARCHAR(500),
    client_ip VARCHAR(64),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID
);
CREATE INDEX ix_device_integrity_checks_recorded_at ON auth.device_integrity_checks(recorded_at);
CREATE INDEX ix_device_integrity_checks_user_id_recorded_at ON auth.device_integrity_checks(user_id, recorded_at);
CREATE INDEX ix_device_integrity_checks_verdict ON auth.device_integrity_checks(verdict);
```

**Live verified:** SKIPPED verdict (no header), PASS (valid token), FAIL (mock-fail) — all recorded in DB. Enforce=true → 403 on FAIL confirmed.

## BUG-W7-IOS-001: ChatService SignalR Hub 404

**Root cause:** Mobile `HUB_BASE_URL` in `ChatDetailScreen.tsx` uses `apiBaseUrl` which defaults to port 5101 (AuthService). Hub negotiate hits AuthService → 404. ChatService hub is at port 5107.

**Backend fix:** ChatService DI now uses `AbortOnConnectFail=false` for Redis connection attempt. If Redis unavailable in dev, falls back to in-process SignalR + in-memory distributed cache. Hub registers and answers negotiate (401) even without Redis.

**Mobile fix required (mobile-dev):** Change `HUB_BASE_URL` to use `chatServiceBaseUrl` from extra config, defaulting to port 5107. See docs/api/endpoints.md Wave 8 section for exact code.

## Test Counts

- AuthService: 780 passing (was 641, +139)
- ChatService: 199 passing (was 195, +4)

**How to apply:** Reference [[project-wave8-device-integrity]] when configuring Play Integrity / App Attest credentials for production rollout. Set `DeviceIntegrity:Enforce=true` only after monitoring telemetry for false-positive rates.
