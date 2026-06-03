---
name: task20-auth-features
description: Task #20 auth features — user preferences, devices/sessions, password reset, 2FA TOTP — component patterns and gotchas
metadata:
  type: project
---

Task #20 completed 2026-06-03. Four backend auth features wired to admin UI.

**Files added:**
- `src/lib/devicesApi.ts` — GET /auth/devices, DELETE /auth/devices/{id}, Zod-validated
- `src/lib/settingsApi.ts` — extended: getUserPreferences, updateUserPreferences (real shape), get2FaStatus, enroll2Fa, confirm2Fa, disable2Fa, forgotPassword, resetPassword
- `src/pages/settings/sections/UserPreferencesSettings.tsx`
- `src/pages/settings/sections/DevicesSettings.tsx`
- `src/pages/settings/sections/TwoFaSettings.tsx`
- `src/pages/auth/ForgotPasswordPage.tsx`
- `src/pages/auth/ResetPasswordPage.tsx`
- `src/__tests__/AuthFeatures.test.tsx` — 57 tests

**Files modified:**
- `src/pages/settings/SettingsPage.tsx` — added Account group with 3 new nav items + section components
- `src/router.tsx` — added /forgot-password and /reset-password as public routes
- `src/pages/auth/InviteAcceptancePage.tsx` — changed href from `/login?forgot=1` to `/forgot-password`
- `src/i18n/en.json, hi.json, bn.json` — 101+ new keys

**New npm dep:** `qrcode.react@^4.2.0` installed with `--legacy-peer-deps`.
Use `QRCodeSVG` (named export) from `qrcode.react`, NOT default export.
In tests: `vi.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }) => <div data-testid="qr-code" /> }))`.

**Badge/EmptyState gotchas:**
- Badge component uses `variant` prop (not `color`) — valid variants: default/brand/success/warning/error/info/neutral/gst/itr/loan
- EmptyState component uses `variant` string (predefined list), NOT an `icon` prop. For custom empty states, render inline JSX instead.

**Anti-enumeration pattern:** ForgotPasswordPage calls `forgotPassword()` then shows success whether the mutation succeeds or errors — same "check your email" message either way.

**ResetPasswordPage:** reads `?token=...` from URL via `useSearchParams()`. Shows inline error if token missing before user submits.

**2FA dialog flow:** enroll (POST /enroll) -> QR dialog (step: qr -> confirm -> recovery). Recovery step uses `mandatoryConfirm` until checkbox acknowledged. `disable2Fa` accepts TOTP or recovery code — no format enforcement (backend validates).

**Test gotcha:** `getByLabelText(/new password/i)` matches BOTH "New password" and "Confirm new password" labels — use exact string `'New password'` / `'Confirm new password'` instead.

**Why:** 864 tests, 0 lint errors, build clean.
