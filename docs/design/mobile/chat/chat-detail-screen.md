# ChatDetailScreen (Mobile)

> Phase 6F · Track F2 · Route: `app/chat/[threadId]` · Stack: ChatStack > ChatDetailScreen.

## 1. Purpose
Native message thread for end-users (and CAs on the go) — feels like a modern messenger with attachment-from-camera support, typing indicator, read receipts, deep-link target.

## 2. User goal
"Reply to my CA's message, attach a photo of a receipt, see when they read it — even on a 3G connection."

## 3. Layout (top to bottom)
1. Header (56pt) — back, avatar + name + role chip ("CA" / "Support"), status dot (online/last-seen).
2. SubjectBar (32pt) — subject line, CategoryBadge.
3. Messages list (flex-1) — inverted FlatList (newest at bottom, scrolls up to history).
4. Composer (anchored bottom, keyboard-aware, safe-area inset).

### 3.1 Header
- Title is tappable → opens user profile (CA bio sheet).
- Right action: overflow menu (Mute, Mark resolved (CA-only), Report).

### 3.2 SubjectBar
- Single line subject, ellipsis.
- Tap opens "Thread info" sheet (status, category, assigned-to, attachments-summary, file count).

### 3.3 Messages list
- Inverted FlatList for inverted scroll (typing indicator pinned to bottom-most slot).
- ChatBubble component (mobile variant):
  - Self: right-aligned, `--brand-500` bg, white text, max width 78%.
  - Other: left-aligned, `--surface-sunken` bg, `--text-primary`, max width 78%.
  - Avatar shown only on first message of a streak (other-side bubbles).
  - System messages: centered pill, italic, `--text-tertiary`.
- Long-press bubble: action sheet (Copy, Reply, Forward, Delete-own, Report).
- Day separators: centered "Today" / "Yesterday" / "12 Apr 2026".
- Attachment thumbnails inline; tap opens viewer (image lightbox / PdfViewerMobile).

### 3.4 ReadReceipt (self-bubble)
Single open circle (queued) → single check (delivered) → double check tinted `--brand-300` (read). Color + shape together (color-blind safe).

### 3.5 TypingIndicator
Pinned just above composer when other party typing. Animated three-dots bubble + "Aditi is typing…". Auto-removes 3s after last event.

### 3.6 Floating "↓ N new" pill
When user scrolled away from latest, new messages don't auto-scroll; instead a pill appears "↓ 3 new messages". Tap scrolls smooth-to-end.

## 4. Composer
Anchored at bottom; respects keyboard inset:
- TextInput (multiline, auto-grow 1–4 lines).
- Left adornments:
  - Camera icon → routes to existing `CameraScreen` with return-back to compose; captured photo prepended to attachment tray.
  - Attach icon → expo-document-picker.
  - Voice icon (Phase 7 hook — disabled in 6F with "Coming soon" tooltip on long-press).
- Right adornment: Send button (disabled while empty + no attachments). Animated paper-plane.
- Above composer: AttachmentTray — horizontal scroll of pending attachments with remove (x) and per-item upload progress ring.

### 4.1 Offline composing
- Send while offline: bubble appears with QUEUED status (open circle + clock icon).
- On reconnect, auto-flushes from queue.
- Per-item retry on tap (failed bubbles show red icon).

## 5. Empty / loading / error
- Loading: 5 skeleton bubbles alternating sides.
- Empty (new thread, never sent): centered illustration + "Say hello" + suggested prompts ("I have a question about my GSTR-1").
- Send-error per bubble: red retry; tap retries.
- Network down: top banner "Offline · Messages will send when connected".

## 6. Real-time
- SignalR / WebSocket connect on screen mount; auto-reconnect with backoff.
- Typing event: debounced 600ms; emit start; emit end after 3s idle / on send.
- Read event: emitted when newest other-party bubble is fully visible for >800ms.

## 7. Deep-link target
- URL scheme: `snapaccount://chat/{threadId}` and HTTPS universal link `/chat/{threadId}`.
- Push notifications (FCM) carry `threadId` + opens this screen via Linking handler.
- If thread not yet on device cache, show inline loader; do not blank the screen.

## 8. Haptics
- Send success: `Haptics.notificationAsync(Success)`.
- Send error: `Haptics.notificationAsync(Error)`.
- Receive new message while screen open: `Haptics.impactAsync(Light)`.

## 9. Accessibility
- Inverted list: ensure VoiceOver reads in chronological order (use `accessibilityLabel` per bubble incorporating sender + time).
- Each bubble `accessible={true}` with full label; long-press hint: "Double-tap and hold for actions".
- TypingIndicator: `accessibilityLiveRegion="polite"` (Android) + iOS announce pattern; throttled to one announcement per 3s.
- Composer: `accessibilityLabel="Reply"`, supports voice-control "Send".
- Touch targets ≥ 44×44pt; send/camera/attach icons each 44pt hit slop.

## 10. i18n keys
Reuse keys from `chat-thread-detail.md` (admin); plus mobile-specific:
- `chat.mobile.composer.placeholder` ("Message…")
- `chat.mobile.attach.camera`, `chat.mobile.attach.file`
- `chat.mobile.offline.banner` ("Offline · Messages will send when connected")
- `chat.mobile.queued`, `chat.mobile.failed.tapRetry`
- `chat.mobile.newMessages` ("{{count}} new messages")

## 11. Telemetry
- `chat.mobile.viewed { threadId hash, role }`
- `chat.mobile.send { hasAttachments, online }`
- `chat.mobile.deeplink_opened { source: 'push'|'url' }`

## 12. Components used
ChatBubble (mobile variant), TypingIndicator (mobile), ReadReceipt, MessageInput (mobile, with attachment slot + camera button), AttachmentTray, CategoryBadge, Avatar, StatusBadge (header), Sheet (Thread info, action menu), CelebrationOverlay (none here, kept for related screens).
