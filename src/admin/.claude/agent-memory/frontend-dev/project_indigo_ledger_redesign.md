---
name: Indigo Ledger Redesign
description: Design system migration from blue to indigo palette — what changed and key decisions made
type: project
---

The admin panel was migrated from "Trust Blue" (#2563EB) to "Indigo Ledger" (#4F46E5) design system to match the mobile app.

**Key changes made:**

- `globals.css`: Brand scale now indigo (#EEF2FF → #1E1B4B), neutral scale switched from gray to slate (#F8FAFC → #020617), shadows use rgba(15,23,42,...) tinted with slate instead of pure black, Inter font added
- `Card.tsx`: border prop default changed to `false` (no-border rule), hover adds `-translate-y-px` lift, rounded-xl default
- `Button.tsx`: Primary uses `bg-gradient-to-br from-brand-500 to-brand-700`, ghost hover is `hover:bg-neutral-100`, focus rings use `/30` opacity variant
- `Badge.tsx`: All badges now `rounded-full` (pill shape), bg colors use -50 shade instead of -100
- `Input.tsx`: Uses `bg-neutral-50` fill (no border), focus switches to `bg-white ring-2 ring-brand-500/20`
- `DataTable.tsx`: Removed row borders, uses `even:bg-neutral-50/50` alternating tints, hover is `hover:bg-brand-50/30`, pagination replaced Button components with native pill buttons to avoid unused import lint errors
- `Modal.tsx`: Overlay uses `bg-neutral-900/40 backdrop-blur-sm`
- `Sidebar.tsx`: Background changed to `bg-neutral-800` (dark slate), active item has 3px left indigo bar + `bg-white/10`, hover is `hover:bg-white/5`, user avatar has online green dot
- `TopBar.tsx`: Uses `bg-white/80 backdrop-blur-md sticky top-0 z-30`, notification dot changed from error-500 to brand-500
- `MetricCard.tsx`: No border, icon container uses gradient bg, trend shown as pill badge
- `AlertBanner.tsx`: No left border, uses full rounded-xl card with softer semantic colors (emerald/red/amber)
- `LoginPage.tsx`: Full viewport gradient background `from-brand-600 via-brand-500 to-indigo-400`, white card with shadow-2xl
- `DashboardPage.tsx`: Chart stroke updated to #4F46E5, system health uses pill badges, `cn` import added

**Why:** Mobile app was already on indigo premium palette; admin panel needed to match for design consistency across the platform.

**How to apply:** Any new components should use brand-500 = #6366F1 and brand-600 = #4F46E5, not blue. No 1px solid borders on cards — use background contrast + shadow instead.
