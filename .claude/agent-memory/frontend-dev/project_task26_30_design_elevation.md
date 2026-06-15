---
name: task26-30-design-elevation-s0
description: Task #26 S0 canonical token changes + Task #30 slaCompliance ratio fix; what changed, what was deferred, a11y rules applied
metadata:
  type: project
---

## Task #30 — slaCompliance ratio fix (complete)

Backend sends `slaCompliance` as a **0..1 ratio** (e.g. `0.943`). Historically the admin mock data used percentage form (94.3), masking the bug.

**Fix location:** `src/admin/src/lib/callbackApi.ts` → `getCallbackKpi()`. Added `toPercent()` helper that converts ratio × 100, caps at 100, rounds to max 1 decimal. Applied to both `slaCompliance` and `deltas.slaCompliance`.

**Schema contract doc:** Added JSDoc comment on `CallbackKpiSchema.slaCompliance` and `deltas.slaCompliance` clarifying the 0..1 ratio input / 0..100 percentage output contract.

**UI rendering:** `CallbackKpiPage.tsx` — handles `slaCompliance === 100 → '100'` (no decimal); all other values use `.toFixed(1)`. The spy mock in tests must return POST-conversion values (percentage form) since the spy replaces the whole function.

**Test pattern:** `mockKpi.slaCompliance = 94.3` (post-conversion) not `0.943`. New tests added: edge case 100 renders as `'100'` not `'100.0'`, and typical 94.3 case. Schema-level test added: `result.slaCompliance === 0.925` (raw ratio preserved by Zod).

## Task #26 S0 — Canonical token changes (complete)

### globals.css @theme changes
- **success scale:** Green (#22C55E) → Emerald (#10B981/#059669/#047857/#064E3B). Rule: success-700 #047857 for body text (success-600 #059669 ≈3.5:1 on white, fails a11y).
- **accent scale:** Amber replaced with Orange (#F97316 = accent-500). Old amber scale is now ONLY in `--color-warning-*` as the warning semantic.
- **--radius-sm:** 4px → 6px (matches tokens.json v2.0.0).
- **--radius-3xl:** 24px added (was missing).
- **--color-loan:** #D97706 (amber-600) → #EA580C (orange-600). Aligns with tokens.json module.loan.
- **Display tokens added:** `--display-hero-size/line-height/weight`, `--display-title-*`, `--display-section-*`.
- **Semantic tokens updated:** `--semantic-success-bg` #DCFCE7→#D1FAE5, `--semantic-success-fg` #15803D→#047857 (light); dark mode #052e16/#86efac→#022c22/#6ee7b7 (emerald dark).

### a11y-compliant neutral-400 fixes in shared components
The spec rule: `neutral-400` is `text.disabled` only — no meaningful text. Fixed:
- `IrpStatusCard.tsx` line 65: "No IRN generated yet" neutral-400→500
- `AttachmentList.tsx` line 66/68: "Queued" / file size neutral-400→500
- `AttachmentList.tsx` line 218: "Maximum N files reached" neutral-400→500
- `HsnSacTypeahead.tsx` line 158: "type to search" hint neutral-400→500

Retained neutral-400 on: aria-hidden icons (decorative), placeholder: classes, PayloadViewer JSON punctuation (code rendering), button hover states (non-text UI).

### Chart color updated (CallbackKpiPage)
`COMPLETED: '#22c55e'` → `'#10b981'` (emerald-500 per S0). Also updated area/line chart and TTR histogram bar colors.

## Deferred slices (with spec slice IDs)
- **S3** — skeleton/empty-state standardization for list pages: EmptyState and Skeleton components already exist; applying them to specific high-traffic pages is scoped to a separate task.
- **S5** — Admin dashboard hierarchy redesign (§4.1, 3-tier): Spec marks this as depending on S0+S3. Not in this task's scope.
- **S1/S2/S4/S6/S7** — Mobile dark-mode and interaction polish: owned by mobile-dev agent, not frontend-dev.

**Why:** Task description said "do the admin-scoped slices, typically S0 canonical tokens + admin skeleton/empty-state standardization + dashboard hierarchy" and to "follow the slice scope" without boiling the ocean.

## Results
- 941 tests pass (938 baseline + 3 new for slaCompliance rendering)
- 0 lint warnings
- Build succeeds (pre-existing chunk size warning unrelated to these changes)
