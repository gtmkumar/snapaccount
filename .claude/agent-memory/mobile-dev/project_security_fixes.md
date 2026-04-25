---
name: Security Fixes Phase 5
description: SEC-014 (TLS pinning), SEC-015 (screenshot prevention), SEC-023 (PAN exclusion from SecureStore) applied in Phase 5
type: project
---

SEC-014, SEC-015, SEC-023 security fixes applied to mobile/ in Phase 5 (2026-04-05).

**Why:** Security audit flagged these as Medium/Low severity — must be resolved pre-launch per audit recommendations.

**How to apply:** When adding new financial screens (loan, GST, ITR), always call `useSensitiveScreen()` from `src/hooks/usePreventScreenCapture.ts` at the top of the component. When cert rotation happens, update `PINNED_CERTS` in `src/lib/pinnedHttpClient.ts` following the procedure documented in that file.

Key files:
- `src/lib/pinnedHttpClient.ts` — SSL pinning client (placeholder hashes; DevOps must replace before production)
- `src/hooks/usePreventScreenCapture.ts` — `useSensitiveScreen()` hook
- `src/store/authStore.ts` — partialize now strips `panNumber` from user and all org entries
- `src/types/modules.d.ts` — ambient type shims for `react-native-ssl-pinning` and `expo-screen-capture`

Pre-existing TypeScript errors (7 errors in auth/navigation files, all in FirebaseAuthTypes namespace access and `[never, never]` tuples) — not caused by SEC fixes, were present before Phase 5.
