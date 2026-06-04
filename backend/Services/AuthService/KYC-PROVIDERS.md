# Government Document Verification (KYC) Providers

AuthService verifies four government documents — **PAN, AADHAAR, GSTIN, TAN** — for the
per-organization *"Require OTP-based government verification"* toggle
(`auth.organization.government_verification_enabled`).

Verification runs **only when the toggle is ON**. When OFF, documents are stored as unverified
details (`SAVED`) to assist GST/ITR/loan filing — no provider is ever called.

## Provider selection

The active provider is chosen at startup by `KYC_PROVIDER` (env) or `Kyc:Provider` (config):

| Value | Adapter | Use |
|-------|---------|-----|
| `mock` (default) | `MockDocumentVerificationProvider` | Local dev / tests. Logs a dev OTP; passes format-valid inputs. OTP `000000` fails, any other 6 digits succeed. |
| `sandbox` | `SandboxKycProvider` | Real verification via the **Sandbox (Quicko) tax-API stack** (`api.sandbox.co.in`). |

Both implement `IDocumentVerificationProvider` (the four-kind flow) **and** `IKycProvider`
(legacy `/auth/me/kyc/*`), so handlers never change between providers.

## OTP vs. direct verification — important

The two-step send → confirm flow is a **mock artifact**: in reality only **Aadhaar** is OTP-based.

| Kind | Real mechanism | How the adapter fits the send/confirm contract |
|------|----------------|------------------------------------------------|
| **AADHAAR** | UIDAI OKYC OTP (genuine 2-step) | `SendOtp` → `POST /kyc/aadhaar/okyc/otp` returns `reference_id` (the transaction id). `VerifyOtp` → `POST /kyc/aadhaar/okyc/otp/verify` with the real OTP; `data.status == "VALID"` ⇒ verified. |
| **PAN / GSTIN / TAN** | Direct lookup, **no OTP** | The document number is gone by confirm time, so the real lookup runs at **`SendOtp`** and its verdict is sealed into the returned `transactionId` as an **AES-encrypted, expiring, kind-bound token** (`KycVerdictTokenCodec`, keyed off `ENCRYPTION_KEY`). `VerifyOtp` decrypts it and returns the verdict — **the OTP value is ignored** for these kinds. Tampered/expired tokens ⇒ `FAILED`. |

This keeps zero churn in the handlers/frontend and is stateless (safe on multi-instance Cloud Run).

### Known UX limitation / follow-up
Because the unified flow prompts for an OTP on **all** kinds, a user verifying PAN/GSTIN/TAN is
asked for an OTP that is never sent (same behaviour as the mock). The clean fix — a separate
*direct-verify* path for non-OTP kinds (a `RequiresOtp(kind)` capability + handler/frontend branch)
— is deferred. Also: Sandbox's **PAN verify requires `name_as_per_pan` + `date_of_birth`**, which the
current flow does not collect; without them the call may return a negative result. Capturing holder
name/DOB at document entry is a recommended enrichment. TAN has **no public Sandbox KYC endpoint** —
leave `Kyc:Endpoints:TanVerify` empty and TAN returns not-verified (logged), or point it at a
configured aggregator endpoint.

## Configuration

Non-secret defaults live in `appsettings.json` under `Kyc`. **Secrets must NOT go there** (SEC-018).

```jsonc
"Kyc": {
  "Provider": "mock",                 // or "sandbox" (KYC_PROVIDER overrides)
  "BaseUrl": "https://api.sandbox.co.in",   // test: https://test-api.sandbox.co.in
  "ApiVersion": "1.0",
  "TimeoutSeconds": 30,
  "VerificationTokenTtlMinutes": 15,
  "Consent": "Y",
  "Reason": "GST/ITR filing assistance and onboarding for SnapAccount.",
  "Endpoints": {
    "Authenticate": "/authenticate",
    "PanVerify": "/kyc/pan/verify",
    "GstinVerify": "/gst/compliance/public/gstin/search",
    "TanVerify": "",
    "AadhaarOtpSend": "/kyc/aadhaar/okyc/otp",
    "AadhaarOtpVerify": "/kyc/aadhaar/okyc/otp/verify"
  }
}
```

### Secrets

| Variable | Local (user-secrets) | Staging/Prod |
|----------|----------------------|--------------|
| `KYC_API_KEY` / `Kyc:ApiKey` | `dotnet user-secrets set "Kyc:ApiKey" "<key>"` | GCP Secret Manager → env `KYC_API_KEY` |
| `KYC_API_SECRET` / `Kyc:ApiSecret` | `dotnet user-secrets set "Kyc:ApiSecret" "<secret>"` | GCP Secret Manager → env `KYC_API_SECRET` |
| `ENCRYPTION_KEY` | dev fallback key (insecure, logged) | base64 32 bytes in Secret Manager (also used by TOTP) |

To enable real verification:

```bash
export KYC_PROVIDER=sandbox
export KYC_API_KEY=...        # x-api-key
export KYC_API_SECRET=...     # x-api-secret (authenticate only)
export ENCRYPTION_KEY=...     # base64 32 bytes (seals non-OTP verdict tokens)
```

## Auth flow (Sandbox)

`POST /authenticate` with headers `x-api-key`, `x-api-secret`, `x-api-version` → returns a JWT in
`data.access_token`, valid 24h. The token is cached process-wide (`SandboxAccessTokenProvider`,
singleton, semaphore-guarded, refreshed ~1h early) and passed on subsequent calls in the
`Authorization` header **without** the `Bearer` scheme (plus `x-api-key`). A `401` forces one token
refresh + retry. `4xx` ⇒ negative verification result; `5xx`/network ⇒ `KycProviderException`.

## Retargeting to another aggregator

All endpoint paths and the response field names' shapes are Sandbox-specific but the paths are
config-driven. To use Karza/Signzy/Surepass/etc., override `Kyc:Endpoints:*` and (if the response
envelope differs) adjust the small `ReadStatusString` / `ReadTransactionId` helpers in
`SandboxKycProvider`. Auth header conventions may also differ.

## Compliance

- Full Aadhaar is **never** logged or stored — masked to `XXXX-XXXX-NNNN` (DPDP Act 2023).
- Customer consent (`Consent`) is sent on every KYC call and captured in the UI beforehand.
- PAN remains AES-encrypted at rest (`AesPanEncryptionService`, SEC-013).
