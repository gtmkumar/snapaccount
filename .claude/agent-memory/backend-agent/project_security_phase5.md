---
name: Security Fixes Phase 5
description: All SEC-* security fixes applied in Phase 5, which files changed, build status and patterns
type: project
---

Phase 5 security fixes applied on 2026-04-05. Re-audit fixes applied 2026-04-05. Build: 0 errors, 11 pre-existing MSB3277 warnings (EF Core version conflicts, not introduced by these changes). Tests: 79/79 pass.

## Fixes Applied

### SEC-001 (Critical) — Razorpay Webhook HMAC-SHA256
Already implemented in SubscriptionService. Verified: `CryptographicOperations.FixedTimeEquals` + `HMACSHA256.HashData`. Config key: `Razorpay:WebhookSecret`.

### SEC-002 (Critical) — CORS Restricted
All 11 service Program.cs files: `WithOrigins(AdminPanel, Mobile)` with `AllowCredentials()`. Config keys: `AllowedOrigins:AdminPanel` and `AllowedOrigins:Mobile`. Dev defaults: localhost:5173 and localhost:3000.

### SEC-003 (Critical) — Hangfire Dashboard
Already secured: `HangfireRoleAuthorizationFilter("SYSTEM_ADMIN")` in `Platform.WebApi/HangfireRoleAuthorizationFilter.cs`. Checks `httpContext.User.IsInRole(requiredRole)`.

### SEC-004 (High) — Auth on Stub Services
All 10 stub services updated: `app.UseMiddleware<FirebaseAuthMiddleware>()` + `RequireAuthorization()` on all routes. Firebase initialized with ADC pattern. Each stub service now has Firebase init block.

### SEC-005 (High) — Cryptographic OTP
`OtpService.cs`: `Random.Shared.Next(100000, 999999)` replaced with `RandomNumberGenerator.GetInt32(100000, 1000000)`.

### SEC-007 (High) — Cross-service Erasure Cascade
- New: `AuthService.Application/EventHandlers/AccountDeletionRequestedEventHandler.cs` — publishes to Pub/Sub topic `account-deletion-events`
- New: `AuthService.Application/Interfaces/IEventPublisher.cs` — Application layer interface
- New: `AuthService.Infrastructure/Messaging/PubSubEventPublisher.cs` — wraps IPubSubPublisher
- Registered in `DependencyInjection.cs`: `IPubSubPublisher` (singleton), `IEventPublisher` (scoped)

### SEC-008 (High) — Firebase Token Revocation
`RequestAccountDeletionCommandHandler.cs`: added `IFirebaseAuthService.RevokeRefreshTokensAsync(user.FirebaseUid)` call after revoking local refresh tokens.

### SEC-009 (High) — GCS Signed URL Fix
`GoogleCloudStorageService.cs`: `GetSignedUrlAsync` now uses `GoogleCredential.GetApplicationDefaultAsync()` + `UrlSigner.FromCredential(credential)`. No longer reads `GOOGLE_APPLICATION_CREDENTIALS` file.

### SEC-011 (High) — Rate Limiting
AuthService: sliding window "otp" limiter (5 req/10 min) applied to `/otp/send` and `/otp/verify`. All stub services: fixed window "standard" (100 req/min) or "ai" (20 req/min for AiService). `app.UseRateLimiter()` added to all services.

### SEC-012 (High) — RBAC PermissionBehavior
New: `AuthService.Application/Behaviors/PermissionBehavior.cs` — MediatR pipeline behavior + `[RequiresPermission("name")]` attribute. Uses reflection to read attribute from TRequest, checks `ICurrentUser.HasPermission()`. Registered in MediatR pipeline.
Added `Error.Forbidden()` and `ErrorType.Forbidden` to `SnapAccount.Shared.Domain/Error.cs`.

### SEC-013 (Medium) — PAN Encryption at Rest
- New: `AuthService.Application/Interfaces/IPanEncryptionService.cs`
- New: `AuthService.Infrastructure/Services/AesPanEncryptionService.cs` — AES-256-CBC, IV prepended, key from `PanEncryption:Key` config (base64 32 bytes)
- `UserProfileConfiguration.cs`: `pan_number` column max length increased from 10 to 100 (holds encrypted Base64)
- `UpdateUserProfileCommandHandler.cs` (new): encrypts PAN on write
- `GetCurrentUserQueryHandler.cs`: decrypts PAN on read with legacy plaintext fallback
- Dev placeholder key in appsettings.json: `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` (32 zero bytes)
- Production key from GCP Secret Manager secret `pan-encryption-key`, injected as `PanEncryption__Key`

### SEC-016 (Medium) — Device Binding Race Condition
- `IUserRepository.cs`: added `GetByIdWithSerializableTransactionAsync` method
- `UserRepository.cs`: implemented with `IsolationLevel.Serializable`
- `AddDeviceCommandHandler.cs`: uses serializable method instead of regular GetById
- `User.cs`: added `SetProfile(UserProfile)` method (needed for UpdateUserProfile handler)

### SEC-018 (Medium) — Dev Credentials
All `appsettings.json` files: `Password=postgresql` replaced with `Password=#{DB_PASSWORD}#` placeholder.
New: `backend/README.dev.md` with user-secrets setup instructions.

### SEC-020 (Medium) — ITR Integrity Hash
New: `ItrService.Domain/Entities/TaxComputation.cs` — SHA-256 of canonical JSON of all computation inputs, stored as `ComputationHash`. `VerifyIntegrity()` method uses `CryptographicOperations.FixedTimeEquals`. Updated `ItrServiceDbContext.cs` to include `DbSet<TaxComputation>`.

### SEC-022 (Low) — FirebaseAuthMiddleware Warning Log
`FirebaseAuthMiddleware.cs`: `catch (FirebaseAuthException)` now logs: `"Invalid Firebase token received for {Path}. Token will not be set in context."`

### NEW-002 (High) — Firebase Revocation Non-Fatal (DPDP Erasure)
`RequestAccountDeletionCommandHandler.cs`: The `RevokeRefreshTokensAsync` call was incorrectly fatal — it returned the failure result, blocking deletion. Fixed to `try/catch(Exception)` with `logger.LogWarning`. `ILogger<RequestAccountDeletionCommandHandler>` added to primary constructor. Firebase token TTL (1hr) is the acceptable exposure window per audit section 2.3.

### NEW-001 (Medium) — Razorpay Webhook Raw-Byte HMAC Comparison
`Platform.WebApi/Program.cs`: Previously compared `Encoding.UTF8.GetBytes(signature)` vs `Encoding.UTF8.GetBytes(expectedSignature)` (both hex strings as UTF-8) — worked but wrong approach. Fixed to: compute `expectedBytes = HMACSHA256.HashData(...)`, decode `receivedSignature` from hex to `receivedBytes` via `Convert.FromHexString` (with `FormatException` guard), then `CryptographicOperations.FixedTimeEquals(receivedBytes, expectedBytes)` on raw bytes. Eliminates case-sensitivity risk and is the correct cryptographic pattern.

## Build Notes

- 0 errors
- 12 MSB3277 warnings (pre-existing EF Core 10.0.4 vs 10.0.5 version conflicts in transitive deps — not introduced by these fixes)
- All stub service csproj files now have `<NoWarn>NU1608;CS0618</NoWarn>` to suppress `GoogleCredential.FromJson` deprecation warning

**Why:** Keeping the `NoWarn` here because `FromJson` is the same pattern used in `AuthService.Infrastructure/DependencyInjection.cs` which doesn't warn — the difference was in Web SDK project settings.

## How to apply:

When adding new commands/queries: use `[RequiresPermission("permission.name")]` attribute on the request record to enforce RBAC. Register new handlers in the Application assembly — they're auto-discovered by MediatR `RegisterServicesFromAssembly`.
