---
name: dg-auth-02-device-approval-otp-response
description: DG-AUTH-02 fix — VerifyOtpResponse now includes deviceApproval payload; OTP verify handler registers device inline and creates DeviceApprovalRequest so mobile ENFORCE gate fires
metadata:
  type: project
---

## DG-AUTH-02: OTP Verify Inline Device Registration + DeviceApproval Response

**Implemented:** 2026-06-28 on branch `feature/repository-refactor`

### What changed

**`VerifyOtpCommand.cs`** (Platform.Application/Auth/Otp/Commands/VerifyOtp):

1. `VerifyOtpCommand` record extended with optional device metadata fields: `DeviceId`, `DeviceName`, `Platform`, `OsVersion`, `AppVersion`, `FcmToken`.
2. New `DeviceApprovalInfo` record added: `(bool Required, Guid RequestId, string Mode)`.
3. `VerifyOtpResponse` extended with nullable `DeviceApproval` field (6th positional param, default null — fully backward-compatible).
4. `VerifyOtpCommandHandler` now accepts `IAuthDbContext`, `IEventPublisher`, `IConfiguration`, `ILogger` in addition to the existing dependencies.
5. Handler performs inline device registration when `DeviceId + Platform` are both provided:
   - Idempotent: if the device is already bound, just links the refresh token to the existing device entity (no approval needed).
   - New device + user has ≥1 existing device: calls `user.AddDevice()`, persists via `userRepository.UpdateAsync`, creates `DeviceApprovalRequest` via `db.DeviceApprovalRequests`, publishes `DeviceApprovalRequestedEvent` to `device-approval-requests` topic (fire-and-forget), returns `DeviceApprovalInfo` in response.
   - New device + first device (no existing): just registers, no approval needed, `DeviceApproval = null`.
   - `AddDevice` error (e.g. max-2 reached): logs warning, continues login (best-effort device registration).
6. Device registration performed BEFORE refresh token issuance so `RefreshToken.DeviceId` (init-only property) can be set correctly.
7. `VerifyOtpCommandValidator` now validates that `Platform` is required when `DeviceId` is provided.

**`Auth.cs`** (Platform.WebApi/Endpoints/Auth):
- `VerifyOtpRequest` record extended with the same optional device metadata fields.
- `VerifyOtp` handler now forwards all fields to `VerifyOtpCommand`.

### Key design decisions

- **Inline rather than dispatched**: `AddDeviceCommand` requires `ICurrentUser` (populated by Firebase middleware) which is not available at OTP-verify time. The handler inlines the same logic from `AddDeviceCommandHandler` directly.
- **RefreshToken.DeviceId is init-only**: Device registration happens BEFORE the refresh token is created so the device entity Id can be passed at initialization time.
- **No `userRepository.UpdateAsync` duplication**: The `UpdateAsync` call is placed at the end of each branch to avoid double-saving. For the new-user path, `AddAsync` already saved; `UpdateAsync` is called in the device-registration branch to persist the new device child.
- **Fire-and-forget Pub/Sub**: `eventPublisher.PublishAsync` is wrapped in try/catch — push failure does NOT block the login.
- **Backward-compatible**: Clients that don't send `DeviceId` get `deviceApproval: null` in the response, same as before.

### Mobile contract (already in place, now activates)

`OTPVerifyScreen.tsx:133` checks `deviceApproval?.required && deviceApproval.mode === 'ENFORCE'` → navigates to `DeviceWaiting` screen. This gate was permanently dormant before this fix; now it fires when `DeviceApproval:Enforce=true` config is set and the user logs in from a new device.

### Build state

`dotnet build Services/AppHost/AppHost.csproj`: 0 Errors, 22 Warnings (pre-existing).

**Why:** [[dg-auth-01-device-binding-mobile]] is a companion gap (mobile-dev owned) that adds the POST /auth/devices call from mobile. This backend fix closes the login-time server gap; DG-AUTH-01 will add post-login device registration as a separate mobile call once the mobile team picks it up. Both together close the full GAP-047 flow.
