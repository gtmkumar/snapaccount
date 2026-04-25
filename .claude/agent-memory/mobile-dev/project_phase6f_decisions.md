---
name: Phase 6F Decisions
description: Phase 6F final UX polish — Chat, haptics, dark mode, network chip, celebrations, BackgroundFetch; key decisions, contract gaps, test baseline
type: project
---

Phase 6F (Final) is complete as of 2026-04-25.

**Test baseline going in**: 204 tests (1 pre-existing failure: LoanPackagePreviewScreen watermark)
**Test baseline coming out**: 235 tests, same 1 pre-existing failure

**Why:** Final UX polish phase covering Track F2 (Chat full implementation) and Track F4 (haptics, dark mode, network-aware UX, celebrations).

**How to apply:** Reference for any Phase 7 work that builds on these foundations.

## Packages added
- expo-haptics ~14.0.1
- expo-task-manager ~12.0.6
- expo-background-fetch ~13.0.6
- expo-store-review ~8.0.1
- @microsoft/signalr ^10.0.0

## New mock files required (moduleNameMapper)
- expo-haptics → src/__mocks__/expoHaptics.ts
- @microsoft/signalr → src/__mocks__/signalr.ts
- expo-task-manager → src/__mocks__/expoTaskManager.ts (must include isTaskDefined)
- expo-background-fetch → src/__mocks__/expoBackgroundFetch.ts
- expo-store-review → src/__mocks__/expoStoreReview.ts
- expo-screen-capture → src/__mocks__/expoScreenCapture.ts (pre-existing gap fixed)
- expo-constants → src/__mocks__/expoConstants.ts (pre-existing gap fixed)

## CONTRACT_GAPS
1. CONTRACT_GAP_SIGNALR_RN: @microsoft/signalr v8+ uses browser WebSocket global. React Native has WebSocket but not EventSource (SSE). Configure with skipNegotiation=false and WebSockets transport. REST /typing fallback via postTypingPing() when SignalR unavailable. Flagged in chat.ts comments.
2. expo-local-authentication: still deferred per P6-HANDOFF-24. Biometric gates in network-aware-ux.md spec not wired to actual LocalAuthentication calls.
3. expo-document-picker: still deferred. Attach icon in ChatDetailScreen is present but handler not wired.
4. App rating prompt (expo-store-review): structure created but not wired to GST filing success event — needs GstApprovalScreen/useGstFilingMutation hook integration in Phase 7.

## i18n structure decision
All new keys nested under `mobile.*` in en/hi/bn.json (matching existing pattern).
New sections added: mobile.chat.*, mobile.celebration.*, mobile.net.*, mobile.bio.*, mobile.theme.*
Screens use t('mobile.chat.list.title') etc.

## Navigation structure
- ChatStack.tsx: ChatList → ChatDetail (new navigator)
- MoreStack.tsx: 'Chat' route → ChatStack component; 'ChatList' kept as alias
- MoreScreen.tsx: 'Expert Chat' card navigates to 'Chat' (not 'ChatList')
- notificationRouter.ts: chat_message_received → ChatDetail, loan_disbursed/loan_approved → LoanStatus

## SignalR pattern
- buildChatHubConnection() creates HubConnectionBuilder instance
- subscribeChatHub() attaches all event listeners, returns unsubscribe fn
- useFocusEffect starts/stops hub on screen focus/blur
- Typing debounce: 600ms; stop timeout: 3s

## Sensitive screens audit (SEC-033 follow-up)
Added useSensitiveScreen() to: RequestCallbackModalScreen, ChatDetailScreen
Already present: all ITR, GST, Loan, LoanConsent, LoanPackagePreview, etc.

## Dark mode
ThemeContext.tsx at src/contexts/ThemeContext.tsx
- 'system' (default) follows Appearance API
- Persisted in AsyncStorage (non-sensitive)
- Server-sync via PATCH /me/preferences debounced 1.5s using require() (not dynamic import — TypeScript module config constraint)
- LIGHT_TOKENS / DARK_TOKENS defined inline

## CelebrationOverlay extension
Kind enum expanded: APPROVED|DISBURSED (legacy) + firstGst|firstRefund|firstItr|firstNoticeResolved|planK2Step15|firstChatResolved|custom
KIND_ICON lookup map added. Copy resolved per kind via switch statement.

## useDocumentQueue BackgroundFetch
- DOCUMENT_QUEUE_BG_TASK = 'SNAPACCOUNT_DOC_QUEUE_FLUSH'
- Defined at module level with isTaskDefined guard
- registerDocumentQueueBgFetch() called on hook mount
- Background task reads AsyncStorage directly (hook may not be mounted)
