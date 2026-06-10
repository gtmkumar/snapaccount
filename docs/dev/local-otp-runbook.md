# Local OTP Runbook — "Continue with OTP"

How to get the 6-digit OTP on your machine when you tap **Continue with OTP** in the
mobile app (or call `/auth/otp/send` directly), and how to finish login locally.

> **TL;DR** — In local/dev the OTP is **printed to the AuthService console log**:
> `OTP for 9876543210: 482913 (DEVELOPMENT ONLY — never log in production)`.
> No real SMS is sent. Read that line, type the code in the app, you're in.

---

## 1. Why there is no SMS locally

In production the OTP is delivered by **MSG91** and never leaves the server in
plaintext. Locally MSG91 is not configured, so two things happen instead:

1. **The OTP is logged.** `OtpService.SendOtpAsync` logs the plaintext OTP at
   `Warning` level on every non-`Production` environment:

   ```
   backend/Services/AuthService/AuthService.Infrastructure/Services/OtpService.cs
   ```
   ```csharp
   var env = configuration["ASPNETCORE_ENVIRONMENT"];
   if (!string.Equals(env, "Production", StringComparison.OrdinalIgnoreCase))
       logger.LogWarning("OTP for {Phone}: {Otp} (DEVELOPMENT ONLY — never log in production)", phoneNumber, otp);
   ```

2. **MSG91 "delivery" no-ops.** The send still "succeeds" because the OTP row is
   already persisted; an SMS failure is only logged, not propagated.

> ⚠️ **You cannot read the OTP from the database.** It is stored as a
> SHA-256 hash (`auth.otp_request.otp_hash = sha256("<phone>:<otp>")`), never as
> plaintext. The console log is the *only* place the actual digits appear.

---

## 2. The flow end-to-end

```
Mobile (PhoneEntryScreen)                 AuthService (:5101)
─────────────────────────                 ───────────────────
tap "Continue with OTP"
   └─ POST /auth/otp/send  ───────────────►  OtpService.SendOtpAsync
      { "phoneNumber": "9876543210" }          • generate 6-digit OTP (secure RNG)
                                                • store sha256 hash in auth.otp_request
                                                • LOG  "OTP for 9876543210: 482913"   ◄── READ THIS
                                                • (MSG91 send — no-op locally)
   ◄────────── 200 { otpRequestId, message }

OTPVerifyScreen
   └─ POST /auth/otp/verify ──────────────►  OtpService.VerifyOtpAsync
      { "phoneNumber": "9876543210",            • sha256("<phone>:<otp>") == stored hash?
        "otp": "482913" }                       • mark used, issue session JWT
   ◄────────── 200 { accessToken, ... }
```

Endpoints (`backend/.../AuthService.Api/Endpoints/Auth.cs`):
- `POST /auth/otp/send`  — body `{ "phoneNumber": "9876543210" }`
- `POST /auth/otp/verify` — body `{ "phoneNumber": "9876543210", "otp": "482913", "deviceId": "..." }`

---

## 3. Where to read the OTP (three ways)

### A. AuthService console (most common)

If you started AuthService standalone:

```bash
cd backend/Services/AuthService/AuthService.Api
dotnet run
```

watch its terminal — after you tap **Continue with OTP** the line appears:

```
warn: AuthService.Infrastructure.Services.OtpService[0]
      OTP for 9876543210: 482913 (DEVELOPMENT ONLY — never log in production)
```

### B. Aspire dashboard logs

If you ran the whole backend via Aspire (`dotnet run --project AppHost`), open
the dashboard at **http://localhost:15888**, select **auth-service**, and filter
the structured logs for `OTP for`.

### C. Tail the log from another terminal

If AuthService is running in the background and writing to a file, grep it live:

```bash
# Console redirected to a file (e.g. you launched with `dotnet run > /tmp/auth.log 2>&1 &`)
grep --line-buffered "OTP for" /tmp/auth.log
```

> The OTP regenerates on every `/auth/otp/send`. Always use the **latest**
> logged code — `VerifyOtp` picks the most recent un-used request for that phone.

---

## 4. Valid phone-number formats (gotchas)

| Field | Required format | Example | Rule |
|---|---|---|---|
| Login phone (`/auth/otp/send`) | **plain 10 digits**, starts 6–9, **no `+91`** | `9876543210` | `SendOtpCommandValidator`: `^[6-9]\d{9}$` |
| Invite phone (`POST /auth/invite`) | **E.164** with country code | `+919876543210` | different validator |

The app prepends `+91` only for display; it sends the bare 10 digits to the API.

---

## 5. Constraints you'll hit while testing

- **5-minute expiry** — `ExpiresAt = UtcNow + 5 min`. Request a fresh OTP if it lapses.
- **Cooldown / lockout** — too many failed attempts locks the request (`Otp.MaxAttemptsReached`, 30-min lock); repeated sends trigger `Otp.Cooldown`.
- **Rate limit (SEC-011)** — `/auth/otp/send` and `/auth/otp/verify` are limited to
  **5 requests / 10 min per client IP**. Hammering them returns HTTP 429. Wait, or
  restart the service to reset the in-memory limiter.

---

## 6. Quick reproduction with curl (no app needed)

```bash
# 1. Send — then read the OTP from the AuthService log
curl -s -X POST http://localhost:5101/auth/otp/send \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"9876543210"}'

# 2. Verify with the code you just read (replace 482913)
curl -s -X POST http://localhost:5101/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"9876543210","otp":"482913","deviceId":"dev-curl"}'
# → 200 { "accessToken": "...", ... }  ← session JWT
```

---

## 7. Pre-requisites checklist

- AuthService running on **:5101** (`ASPNETCORE_ENVIRONMENT=Development`, **not** Production).
- PostgreSQL up: `docker compose up postgres redis -d`
  (`Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql`).
- DB password secret set once: `dotnet user-secrets set "DB_PASSWORD" "postgresql"`.
- Mobile app pointed at your local AuthService host — see
  [`mobile-backend-local-dev`](../../mobile/README.md) / `app.json` per-service hosts.

---

## 8. Related code

| Concern | File |
|---|---|
| OTP generation + log line + hashing | `backend/Services/AuthService/AuthService.Infrastructure/Services/OtpService.cs` |
| Send command + phone validator | `backend/Services/AuthService/AuthService.Application/Otp/Commands/SendOtp/SendOtpCommand.cs` |
| Verify command | `backend/Services/AuthService/AuthService.Application/Otp/Commands/VerifyOtp/VerifyOtpCommand.cs` |
| HTTP endpoints | `backend/Services/AuthService/AuthService.Api/Endpoints/Auth.cs` |
| OTP table mapping (`auth.otp_request`) | `backend/Services/AuthService/AuthService.Infrastructure/Persistence/Configurations/OtpRequestConfiguration.cs` |
| Mobile phone entry / verify screens | `mobile/src/screens/auth/PhoneEntryScreen.tsx`, `mobile/src/screens/auth/OTPVerifyScreen.tsx` |
