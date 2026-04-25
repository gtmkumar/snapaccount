# Phase 6F — Admin Polish + Chat + Reports + Subscription + UX Pass

> **Priority:** P1 (production polish — quality bar)
> **Duration:** 3 weeks (parallelizable into 3 tracks)
> **Depends on:** Phase 6A, 6B, 6C, 6D, 6E complete
> **Source:** `phase-6-gap-analysis.md` §3 admin table, §4 mobile table, §6 UI/UX recs, §8.6

---

## Why this is P1

Phase 6A–E ship functional completeness. Phase 6F lifts the product from "feature-complete" to **"shippable quality"**: no stub pages, cohesive design system, role-based nav, dark mode, offline mobile, celebration animations. Chat + Reports + Subscription close the remaining microservice gaps.

---

## Tracks (can run in parallel)

### Track F1 — Design System Refresh + Admin UX Pass

**ui-ux-agent (docs/design/):**
- Audit `src/admin/src/ui/` — ensure primitives exist: Button, Card, Badge, Input, Select, Checkbox, Radio, Switch, Toast, Skeleton, EmptyState, Dialog, Drawer, Tabs, Stepper, ErrorBoundary, CommandPalette, DataTable (compact + roomy variants), DateRangePicker, Combobox, DropdownMenu.
- Dark mode token spec (tokens already exist per gap analysis — activate).
- Role-based shell: 4 roles (ADMIN, CA, LOAN_OFFICER, OPS) × nav visibility matrix.
- Keyboard shortcut surface: `?` opens cheat-sheet, `cmd+k` command palette, `g h` go home, `g u` users, etc.

**frontend-dev (src/admin/):**
- Build any missing primitives (Toast etc. already seeded in 6A). Extend with Skeleton, EmptyState, Dialog, Stepper, DataTable variants, CommandPalette, DateRangePicker, Combobox.
- `RoleGuard` component + route-level guards reading `useCurrentUser()` permissions.
- **Kill every StubPage usage.** Every `ChatPage`, `ItrPage`, `LoansPage`, `ReportsPage`, `SubscriptionsPage`, `TeamPage` already has real pages from prior sub-phases — ensure no stub remains.
- Wire **all 8 Settings sections** to real config API endpoints (currently local state only — gap analysis §3). Add optimistic update + toast feedback pattern.
- Dark mode toggle + persisted preference.
- Accessibility sweep: focus-visible rings, ARIA on status chips, keyboard traps in dialogs, screen-reader labels on icon-only buttons.
- Lighthouse audit target: Performance ≥90, Accessibility ≥95, Best Practices ≥95.

### Track F2 — ChatService + Mobile Chat Flow

**db-engineer (additive):**
- `chat.threads`, `chat.messages`, `chat.thread_participants`, `chat.read_receipts`, `chat.typing_state` (ephemeral, Redis-backed preferred — but keep audit log in Postgres).
- Category routing: `chat.categories`, `chat.routing_rules`.

**backend-agent (ChatService):**
- Real-time hub: `ChatHub.cs` on SignalR; authorize via JWT; groups per thread_id.
- Sticky sessions for Cloud Run (risk #10 — devops decision required).
- Handlers: StartThread, SendMessage, MarkRead, TypingPing, EscalateToCa, SearchHistory.
- Category auto-routing on first user message (keyword + ML-lite heuristic).
- 0 501; 0 TODO.

**ui-ux-agent:**
- Admin ChatInbox with category filter.
- Mobile ChatDetailScreen + ChatListScreen refresh.
- Appointment Booking flow (plan H2) — deferred entry-point only in 6F (full calendar integration to Phase 7 unless team lead elevates).

**frontend-dev:**
- `ChatPage.tsx` full build: inbox, thread view, typing indicator, search.
- SignalR client with reconnection logic.

**mobile-dev:**
- `ChatDetailScreen` — message bubbles, typing indicator, attachment support (reuses CameraScreen).
- Thread badges on `ChatListScreen`.

**devops-engineer:**
- Cloud Run sticky sessions (session affinity) config for ChatService.
- Redis for ephemeral typing state.

### Track F3 — ReportService + SubscriptionService + Remaining Admin Pages

**backend-agent (ReportService):**
- All 6 report types (TrialBalance, P&L, BS, CashFlow, TaxLiability, LedgerByAccount) exposed as:
  - `GET /reports/{type}?format=json` → structured data for admin views.
  - `POST /reports/{type}/pdf` → QuestPDF-rendered PDF (leveraging 6C's QuestPDF foundation).
- Share-with-CA + share-with-bank — generates shareable signed URLs (expiry configurable).
- 0 501; 0 TODO.

**backend-agent (SubscriptionService):**
- Plan CRUD (admin), Subscribe/Cancel/Upgrade, Invoice generation, webhook lifecycle (SEC-001 HMAC already fixed).
- Admin-configurable plan tiers (per Decision 8).
- 0 501; 0 TODO.

**frontend-dev:**
- `ReportsPage.tsx` — generate + preview + download, share-with-CA/bank flow.
- `SubscriptionsPage.tsx` — active subscriptions, MRR dashboard, plan management CRUD.
- `TeamPage.tsx` — user management, role assignment, workload view.
- All role-gated.

**mobile-dev:**
- `FinancialReportsListScreen` refinement (already API-wired in 6A — polish + PDF download).
- `SubscriptionScreen` — current plan + upgrade flow (Razorpay checkout already wired).

### Track F4 — Mobile UX Polish

**mobile-dev:**
- **Offline-first photo capture:** Expo FileSystem local queue → BackgroundFetch task syncs when online. Per-item retry w/ exponential backoff. UI shows QUEUED/UPLOADING/PROCESSING/READY/FAILED states.
- **Optimistic updates:** photo card appears instantly in DocumentList with local thumbnail.
- **Haptic feedback:** Haptics.notificationAsync(Success) on submit/approve/refund-received; Haptics.impactAsync(Light) on taps.
- **Celebration screen:** plan K2 step 15 — "First GST filed!" + "Refund credited!" full-screen celebratory animation (Lottie-based).
- **Deep-link + push-notification routing:** already started in 6B/6E; verify every notification type routes correctly.
- **Biometric re-auth** for sensitive flows: loan application, ITR summary, subscription upgrade.
- **Network-quality-aware UX:** use `@react-native-community/netinfo`; show "slow connection" chip when uploads crawl.
- **App-rating prompt** after successful GST filing (retention driver).
- **Accessibility sweep:** VoiceOver labels, 44x44pt targets verified, high-contrast mode.
- **Dark mode toggle.**

**qa-mobile:** Detox E2E flows — camera → queue → upload → review → dashboard (golden path); offline sim; push deep-links; accessibility audit.

### Track F5 — Cross-cutting hardening

**security-reviewer (read-only per ownership):**
- Final production readiness review across all 11+1 (Callback) services.
- Re-run all SEC-NNN checks.
- DPDP compliance audit (erasure, consent, data localization to asia-south1).
- Secret rotation runbook.

**devops-engineer:**
- Staging → Production promotion runbook.
- Observability: Cloud Monitoring dashboards per service (RED metrics).
- SLO definitions (p95 latency, availability).
- Backup + restore drill.

---

## Exit Criteria

1. **Zero StubPage usages anywhere in the admin.**
2. All 8 Settings sections persist to backend; toast feedback on save; optimistic updates.
3. Role-based nav: admin, CA, loan-officer, ops each see only authorized entries.
4. Dark mode toggle persists; no visual regressions in either theme.
5. Lighthouse admin: Performance ≥90, Accessibility ≥95, Best Practices ≥95, SEO ≥90.
6. Command palette (cmd+k) jumps to user, document, return, callback.
7. ChatService SignalR: real-time messages between two browsers within 500ms.
8. Mobile ChatDetailScreen end-to-end w/ typing indicators + read receipts.
9. ReportsPage: generate, preview, download, share-link — all 6 report types.
10. SubscriptionsPage: create plan, subscribe, upgrade, cancel, view MRR.
11. TeamPage: invite, role-assign, workload view.
12. Mobile offline queue: airplane-mode capture → reconnect → sync within 30s.
13. Celebration screen: fires on first GST filed, first refund credited.
14. Biometric re-auth on sensitive flows.
15. Detox E2E green on iOS + Android.
16. Zero new Critical/High security findings.
17. Staging smoke test green; promotion runbook validated.
18. All services: 0 501 responses, 0 TODO markers, ≥80% test coverage.

---

## Dependencies & Risks

- **SignalR on Cloud Run** (gap analysis risk #10) — session affinity; devops decision required before Track F2 starts.
- **Offline-first data model** (risk #9) — backend must accept client-generated idempotency keys; coordinate with backend-agent.
- **QuestPDF license** — confirmed in 6C.
- **Lighthouse targets** can be hard to hit; plan a performance pass early.
- **Dark mode regressions** — visual QA across all pages (both themes).
- **Staging → Prod** — real tenant data cannot be tested against staging; establish blue-green promotion.

---

## Owner Agents

4 tracks run in parallel, re-syncing at sub-phase close:
- Track F1: ui-ux-agent + frontend-dev.
- Track F2: db-engineer → backend-agent → frontend-dev + mobile-dev (+ devops-engineer for Cloud Run).
- Track F3: backend-agent → frontend-dev + mobile-dev.
- Track F4: mobile-dev (solo, backend contract pre-agreed).
- Track F5: security-reviewer + devops-engineer (spans all tracks).

Final gate: orchestrator assembles sign-offs from every agent + team-lead walkthrough demo.

---

*End of Phase 6F scope. End of Phase 6 decomposition.*
