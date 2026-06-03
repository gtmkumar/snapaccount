---
name: task-22-social-firebase-signin
description: POST /auth/social/firebase — Google/Apple sign-in exchange endpoint added to AuthService
metadata:
  type: project
---

POST /auth/social/firebase added to AuthService (Task #22).

**Why:** Mobile app completes Google/Apple sign-in via Firebase SDK and exchanges the resulting ID token here to get a SnapAccount session token.

**How to apply:** Reference this when extending social auth, adding new providers, or checking how IFirebaseAuthService.VerifyIdTokenAndGetClaimsAsync is used.

## What was added

1. **`IFirebaseAuthService`** (`Application/Interfaces/IFirebaseAuthService.cs`) — new `FirebaseTokenClaims` record + `VerifyIdTokenAndGetClaimsAsync` method.

2. **`FirebaseAuthService`** (Infrastructure) — implements `VerifyIdTokenAndGetClaimsAsync`; extracts `email` and `name` from `decodedToken.Claims`; in dev (Firebase not configured) this is only called in non-bypass mode.

3. **`SocialFirebaseAuthCommand`** (`Application/Auth/Commands/SocialFirebaseAuth/`) — single file with command record, response record, validator, and handler. Follows the same single-file pattern as `PasswordAuthCommands.cs`.

4. **`Auth.cs`** endpoint — `POST /auth/social/firebase` added, anonymous, rate-limited on "otp" policy (5 req/10 min per IP).

## Key design decisions

- **IConfiguration avoided in Application layer** — bypass detection uses `Environment.GetEnvironmentVariable("DEV_AUTH_BYPASS")` directly, matching the pattern in `CreateUserAdminCommand`. Application.csproj does NOT reference Microsoft.Extensions.Configuration.Abstractions.

- **Validator has two constructors**: parameterless (reads env var for prod/DI registration) + `bool devBypass` (for unit tests without env var mutation).

- **Find-or-create order**: Firebase UID lookup first → email lookup → create new user. Backfills Firebase UID if user was previously created via OTP.

- **2FA gate**: identical to `LoginWithPasswordCommandHandler` — checks `IAuthDbContext.UserTotps`, issues challenge token via `IChallengeTokenService.Issue()`. The caller then uses POST /auth/2fa/challenge.

- **Server-verified email wins**: In production, `VerifyIdTokenAndGetClaimsAsync` returns the Firebase-verified email; this supersedes any client-provided `email` hint.

- **DEV_AUTH_BYPASS stub**: Firebase UID synthesized as `dev_{provider}_{email}`. Validator enforces email is required in bypass mode (no token to extract it from).

## Test count

20 new unit tests in `tests/unit/AuthService/SocialFirebaseAuthTests.cs`. Total: 367 (was 347).

## Response shape

Success:
```json
{
  "isNewUser": bool,
  "token": "firebase-custom-token-or-local-jwt",
  "userId": "guid",
  "refreshToken": "base64-plaintext",
  "refreshExpiresAt": "2026-07-03T..."
}
```

2FA gate (when user has TOTP enabled):
```json
{
  "isNewUser": bool,
  "token": null,
  "userId": "guid",
  "requires2fa": true,
  "challengeToken": "short-lived-challenge-token"
}
```
