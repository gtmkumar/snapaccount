---
name: Auth Architecture Patterns
description: Key auth, OTP, RBAC, PAN encryption and device binding patterns in AuthService
type: project
---

## OTP Flow
- Generation: `RandomNumberGenerator.GetInt32(100000, 1000000)` (cryptographically secure)
- Storage: SHA-256 hash of `"{phoneNumber}:{otp}"` — never plaintext
- Rate limiting: sliding window 5 req/10 min via ASP.NET Core rate limiter
- Brute force: 3 attempts, 30-min cooldown enforced in OtpRequest entity
- Expiry: 5 minutes

## Firebase Auth
- Middleware: `SnapAccount.Shared.Infrastructure.Auth.FirebaseAuthMiddleware` — validates Bearer token, sets `HttpContext.Items["FirebaseUid"]`, `["FirebaseClaims"]`, `["FirebaseDecodedToken"]`
- Does NOT short-circuit on failure — relies on `RequireAuthorization()` to reject
- `IFirebaseAuthService.RevokeRefreshTokensAsync(uid)` called on both logout and account deletion (SEC-008)

## RBAC
- `PermissionBehavior<TRequest, TResponse>` MediatR pipeline behavior in `AuthService.Application/Behaviors/`
- Apply `[RequiresPermission("permission.name")]` attribute on Command/Query record
- `ICurrentUser.Roles` comes from Firebase custom claims set at login
- `ICurrentUser.HasPermission(permission)` checks Roles collection

## PAN Encryption
- Interface: `IPanEncryptionService` in Application layer
- Implementation: `AesPanEncryptionService` (AES-256-CBC, random IV per encrypt, IV prepended to ciphertext)
- Key: base64-encoded 32 bytes from `PanEncryption:Key` config — GCP Secret Manager in production
- Storage: Base64(IV[16] + Ciphertext) — max ~64 chars, stored in `pan_number VARCHAR(100)`
- Read path: decrypt with try/catch fallback (handles legacy plaintext rows pre-migration)

## Device Binding
- Max 2 active devices per account enforced in domain + DB (SERIALIZABLE transaction on add)
- `IUserRepository.GetByIdWithSerializableTransactionAsync()` used for device add operations
- Device deactivation: soft-delete via `DeletedAt`

## Account Deletion (DPDP Act 2023 Right to Erasure)
1. `User.RequestAccountDeletion()` soft-deletes + fires `AccountDeletionRequestedEvent`
2. Handler revokes all local refresh tokens
3. Handler calls `FirebaseAuth.RevokeRefreshTokensAsync(uid)` (SEC-008)
4. `AccountDeletionRequestedEventHandler` publishes to Pub/Sub topic `account-deletion-events` (SEC-007)
5. Other services subscribe and cascade deletion (stubs in place, full implementation per service)
