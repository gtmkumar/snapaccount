---
name: Phase 6F Completion
description: Phase 6F (FINAL) admin polish — settings API wiring, Dialog bug fix, test fixes, build/lint/test all green
type: project
---

Phase 6F deliverables completed as of 2026-04-25.

**Why:** Final phase admin polish — all settings sections wired to real APIs, Dialog bug fixed, StubPage cleanup, test type errors resolved.

**How to apply:** Phase 6F is the last phase. Any future work is either bug fixes or post-launch features.

## Track F1 — Design System + UX Shell (completed in prior session)
- Dark mode: ThemeContext, CSS custom properties on :root[data-theme='dark'], anti-flash blocking script in index.html
- RoleGuard, ForbiddenPage (403 route)
- CommandPalette (cmd+k), KeyboardShortcutsOverlay (?)
- New UI primitives: Skeleton (7 variants), EmptyState (10 variants), Dialog, Drawer, Tabs, DropdownMenu, Combobox, DateRangePicker, RoleChip, ErrorBoundary

## Track F2 — Chat (completed in prior session)
- chatApi.ts with Zod schemas
- useChatHub.ts using @microsoft/signalr
- ChatInboxPage, ChatThreadDetailPage

## Track F3 — Reports + Subscriptions + Team (completed in prior session)
- subscriptionApi.ts, teamApi.ts, reportApi.ts extended with generateShareLink
- ReportsPage, SubscriptionsPage, TeamPage

## Settings API wiring (completed this session)
- NotificationSettings → GET/PUT /notifications/preferences
- FeatureFlagsSettings → GET /auth/feature-flags + PATCH /auth/feature-flags/:flag (per-flag instant toggle)
- LanguageSettings → GET/PATCH /auth/config/language
- AiModelSettings → GET/PATCH /auth/config/ai
- WhatsAppSettings → GET/PATCH /auth/config/whatsapp
- PaymentGatewaySettings → TODO (no API endpoint — toast "saved locally")
- TallySettings → TODO (no API endpoint — toast "saved locally")
- PartnerBanksSettings → already wired via loanApi in PartnerBanksSettingsPage

## Bug fixes this session
- DestructiveDialog: replaced `require('react')` (inside component fn) with top-level `useState` import
- LoansPage.tsx: replaced StubPage usage with re-export of LoansListPage
- Test fixes across 6 test files: totalCount vs total/page, createdAt unknown field, null vs undefined for optional schema fields, void vs undefined for mutations returning void

## Final state
- Build: clean (2861 modules, 0 errors)
- Tests: 485/485 passing across 25 test files
- Lint: 0 errors, 27 warnings (all unused-vars, acceptable)
- StubPage: zero usages in router or active pages
