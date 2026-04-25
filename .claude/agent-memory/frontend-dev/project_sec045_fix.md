---
name: SEC-045 PayloadViewer OAuth token hotfix
description: Security fix — oauth-token kind now masks full bearer token, shows only Bearer ***{last6} + safe fields
type: project
---

SEC-045 FIXED 2026-04-25: PayloadViewer.tsx oauth-token kind previously rendered raw payload string in a `<pre>` element.

Fix: Parse the JSON payload, strip `access_token`, `refresh_token`, `id_token`, `client_secret` entirely, display `Bearer ***{last6}` using `data-testid="oauth-masked-token"`, render remaining fields (scope, expires_in, token_type, etc.) via the existing JsonTree component.

Also fixed as part of this hotfix (all pre-existing lint warnings that were blocking `--max-warnings 0`):
- ChatThreadDetailPage.test.tsx: `Function` type → `(...args: unknown[]) => void`
- ChatInboxPage.tsx: 8 unused imports removed (Inbox, MoreHorizontal, Clock, Tag, PageHeader, Badge, Skeleton, SelectionToolbar, assignThread)
- ChatThreadDetailPage.tsx: useInfiniteQuery, PageHeader, formatDistanceToNow removed
- SubscriptionsPage.tsx, TeamPage.tsx: unused Badge import removed
- Combobox.tsx: MAX_RECENT → _MAX_RECENT, recentKey: _recentKey
- CommandPalette.tsx: X icon removed from imports
- DropdownMenu.tsx: KeyboardEvent type import removed
- Various test files: unused vars prefixed with _

**Why:** `--max-warnings 0` enforced by ESLint; 34 warnings were present before this hotfix (pre-existing from Phase 6F).
**How to apply:** Always check `npm run lint` passes with 0 warnings before reporting complete.

New i18n keys added: `admin.payloadViewer.oauthBearerLabel`, `admin.payloadViewer.oauthSafeFields` (both en.json and hi.json).

SEC-056 (LOW): PaymentGatewaySettings and TallySettings save buttons show "local only — API endpoint pending" toasts intentionally. File-level comments document the missing endpoints. No code change needed.

4 new vitest tests added (all pass): SEC-045 Bearer format, full token not in DOM, scopes+expiry visible, raw token masking.
