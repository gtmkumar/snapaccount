---
name: dg-chat-09-implementation
description: DG-CHAT-09 Chat Analytics (Screen 83) + Video Call Calendar Grid (Screen 82) — implemented 2026-06-28
type: project
---

DG-CHAT-09 implemented on branch `feature/repository-refactor`.

**Why:** Gap audit identified missing Chat Analytics dashboard and calendar stub in CaAppointmentsPage.

**How to apply:** Reference these files and patterns for future chat/CA work.

## What was built

### Chat Analytics Page (Screen 83)
- `/src/admin/src/pages/chat/ChatAnalyticsPage.tsx` — new page at `/chat/analytics`
- Route added to `router.tsx` BEFORE the dynamic `/chat/:threadId` route (static wins)
- Sidebar entries: "Video Calls" (`/ca/appointments`) and "Chat Analytics" (`/chat/analytics`)

### API additions to `chatApi.ts`
- `getChatQueueSnapshot(limit)` → GET `/chat/admin/queue-snapshot` (real, `admin.dashboard.read`)
- `getChatWorkloadByUser()` → GET `/chat/admin/workload-by-user` (real, `admin.dashboard.read`)
- Zod schemas: `QueueItemSchema`, `UserWorkloadSchema`

### Calendar Grid (Screen 82) replacing stub in CaAppointmentsPage
- `CalendarView = 'list' | 'month' | 'week' | 'day'` (NOT 'calendar' — that was the old stub value)
- Sub-components: `MonthGrid`, `WeekGrid`, `DayView` — all pure from date-fns
- `STATUS_DOT` map for colour-coded appointment dots
- Today sidebar + status legend panel
- Calendar navigation: prev/next/today with per-view date math

## i18n keys added
All keys added with parity to `en.json`, `hi.json`, `bn.json`:
- `chatAnalytics.*` (30+ keys)
- `ca.admin.appts.calendar.*` (month/week/day/subViewAria/todaySidebar/legend)
- `ca.calendar.*` (day abbreviations, today, more)
- `common.prev`, `common.next`

## Key patterns / gotchas
- Admin uses custom `t()` from `@/i18n` NOT `useTranslation` from react-i18next (not installed)
- `CalendarView` type uses `'month'` not `'calendar'` — the old stub used string 'calendar'
- CSAT/histogram/heatmap use stable-seed mock data; AlertBanner explains which data is live vs mock
- Sidebar icons: `Video` and `LineChart` from lucide-react
