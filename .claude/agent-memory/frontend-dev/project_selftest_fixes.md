---
name: Admin Panel Self-Test Fixes (2026-04-05)
description: UI issues found and fixed during self-test; dev server runs on port 3000 not 5173
type: project
---

Dev server runs on port 3000 (vite.config.ts sets server.port: 3000), not 5173.

**Why:** vite.config.ts explicitly sets `server: { port: 3000 }`. The task instructions assumed 5173 (Vite default).

**How to apply:** Always navigate to http://localhost:3000 for local dev testing.

---

VITE_DEV_AUTH_BYPASS=true must be set in .env.local to test protected pages without Firebase.

**Why:** All dashboard/protected routes redirect to /login unless Firebase auth is active. The bypass mode injects a mock SYSTEM_ADMIN user.

**How to apply:** Add `VITE_DEV_AUTH_BYPASS=true` and `VITE_DEV_USER_ROLE=SYSTEM_ADMIN` to .env.local before browser testing.

---

Issues fixed during self-test on 2026-04-05:

1. MetricCard title truncated at desktop (1440px, 5-col grid) — changed `truncate` to `leading-snug` to allow wrap
2. Mobile responsive layout broken — sidebar covered full screen at 375px. Fixed AppShell with mobile overlay pattern, hamburger menu in TopBar, backdrop click-to-close.
3. ESLint not installed — added eslint@^8 + @typescript-eslint/* to devDependencies, created .eslintrc.cjs
4. 20 ESLint warnings (unused imports/vars) across 7 files — all fixed cleanly, lint now passes at --max-warnings 0
