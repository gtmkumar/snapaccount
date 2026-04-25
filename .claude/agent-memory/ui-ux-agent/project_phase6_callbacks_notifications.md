---
name: Phase 6A/6E Design Extensions
description: Token reuse patterns and component additions for OCR pipeline deltas (6A) and Callback/Notification system (6E)
type: project
---

Phase 6 extends — never replaces — the 2026 redesign design system (Indigo brand, Slate neutrals, Orange accent, module colors Violet/Cyan/Orange/Indigo).

**Why:** Orchestrator rule is Phase N ≥ 1 appends to existing token/component docs under a labeled "## Phase N" heading and never overwrites prior entries.

**How to apply:**

- Phase 6A deltas: GstReturnReviewPage ARN capture + audit trail (docs/design/admin/gst-return-review-deltas.md); CameraScreen + DocumentListScreen processing badge and retry (docs/design/mobile/camera-screen-deltas.md). Additions: `StatusTimeline.actor` prop, `StatusTimeline.orientation='horizontal'`, `DocumentCard.footerSlot`, document processing status alias `processing` on StatusBadge (maps to brand 100/700 with pulsing dot).

- Phase 6E Callback statuses map to existing Badge variants — **no new colors required**:
  - PENDING → warning, SCHEDULED → info, IN_PROGRESS → brand, COMPLETED → success, FOLLOW_UP_NEEDED → accent, ESCALATED_TO_CA → error, CANCELLED → neutral.

- All new component compositions (`RequestCallbackCTA`, `CallbackStatusChip`, `NotificationRow`, `NotificationPreviewPopover/Sheet`) are documented in their own screen/component files and summary-indexed in component-library.md under Phase 6E.

- Category filter chips use module tokens for GST/ITR/Docs/Loan; Callback = accent.500; Billing = neutral.700; System = neutral.500 — all pairings verified WCAG AA.

- SLA dot colors always paired with text label — never color-alone indicator.

- Single-active-callback-per-category rule drives the CTA↔chip transformation on mobile (design pattern to note for future phases adding similar "one-in-flight" actions).

- Deep-link pattern for push notifications: `snapaccount://<module>/<id>` with Expo Linking; if app cold-starts via deep link while unauthenticated, preserve target and resume after auth. Same pattern for SMS click-links.

- i18n containers sized for ±40% length variation (en/hi/bn); Bengali often wider than Hindi — test on 360px viewport.

- Business hours for callback scheduling flagged "Needs design review" (09:00–20:00 IST assumed; confirm with team lead).

- Offline queue for callback submission flagged "Needs design review" — explicitly out of scope for 6E per orchestrator; may land later.
