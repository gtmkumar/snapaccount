# ChatListScreen — Phase 6F Refresh (Mobile)

> Phase 6F · Track F2 · Route: `app/chat/index` · Extends existing ChatListScreen (Phase 6A baseline).

## 1. Purpose
Add category badges, unread counts, last-message preview, swipe actions, search, and pull-to-refresh.

## 2. User goal
"Glance at my chat list and immediately see which threads have new replies, what category they're in, and swipe to mark resolved."

## 3. Existing baseline (do not change)
- Top bar with title "Chats" + Compose icon.
- FlatList of threads.
- Empty state placeholder.

## 4. New / changed elements

### 4.1 Search bar (sticky top, below header)
- Pull-down or pinned search field (decided per platform: iOS pull-down a-la Mail, Android pinned).
- Placeholder: "Search messages, people, attachments".
- Clear-X icon when text present.

### 4.2 Filter chips row
Below search bar:
- All · Unread · Mentions · Tax · GST · Loan · Bug.
- Horizontally scrollable; selected chip = `--brand-500` filled.

### 4.3 Thread row (extended)

Row height: 84pt (was 64pt) to fit preview line.

```
[Avatar 44pt]  Aditi Sharma                              14:32
               [CategoryBadge: Tax]   ●3
               You: Sure, attaching the form 16…
```

| Element | Detail |
|---|---|
| Avatar | 44pt; shows status dot (online/typing) overlay |
| Name | bold when unread |
| Time | right-aligned, 12pt, `--text-tertiary` |
| CategoryBadge | small chip (icon + text), color per category (see §6) |
| Unread chip | rounded counter `●3` (max "9+") in `--brand-500`; replaces with `mention` icon when @-mentioned |
| Preview | one line, ellipsis; "You: " prefix on self-sent; "typing…" italic when other typing; sender prefix on group threads |

State styles:
- Unread: bolder name, brand-tinted left edge 3pt.
- Selected (rare; mainly for tablet split-view): `--surface-sunken`.

### 4.4 Swipe actions
- Swipe left (RTL: right): Resolve (success bg, check icon), Mute (warning bg, bell-off icon).
- Swipe right (RTL: left): Mark unread (info bg, eye-off), Pin (accent bg, pin).
- Long-swipe past threshold completes the primary action.
- Haptic light tap at threshold; success after action.

### 4.5 Pull-to-refresh
- Native pull-to-refresh. Reloads thread list.
- Below threshold: ghost spinner; above: indeterminate ProgressActivity; success haptic on success.

### 4.6 New-thread FAB
Bottom-right, floating, 56pt, brand color. Tapping opens "New thread" sheet (pick recipient → category → first message).

## 5. Empty / loading / error
- Loading: 6 skeleton rows.
- Empty (no threads): `empty.chat.inbox` illustration + "Inbox zero · Tap + to start a conversation".
- Error (load fail): inline banner + retry; cached threads still listed.

## 6. CategoryBadge palette (mobile shared)
| Category | bg light / dark | fg light / dark | Icon |
|---|---|---|---|
| tax-query | indigo.100 / indigo.950 | indigo.700 / indigo.300 | calculator |
| gst-notice | teal.100 / teal.950 | teal.700 / teal.300 | receipt-text |
| loan | violet.100 / violet.950 | violet.700 / violet.300 | bank-note |
| general | slate.100 / slate.800 | slate.700 / slate.200 | message-circle |
| feature-request | sky.100 / sky.950 | sky.700 / sky.300 | sparkles |
| bug | rose.100 / rose.950 | rose.700 / rose.300 | bug |

All pairs ≥ 4.5:1 light + dark.

## 7. Real-time
- WebSocket subscribed at app-level (not screen) so list updates even off-screen.
- New incoming message: row pulses, re-sorts to top of unread (default sort), unread count increments. Light haptic.
- Typing event: row preview swaps to "typing…" (italic) for 3s.

## 8. Accessibility
- Each row: `accessibilityLabel="{{name}}, {{categoryLabel}}, {{n}} unread, last message {{previewText}}, {{timeAgo}}"`.
- Swipe actions exposed via VoiceOver custom actions ("Resolve", "Mute", "Pin").
- Filter chips: `accessibilityRole="button"`, `accessibilityState={{selected}}`.
- 44×44pt min tap area on every interactive element.

## 9. Haptics
- Pull-to-refresh release: `Haptics.impactAsync(Light)`.
- Swipe-action threshold cross: `Haptics.impactAsync(Light)`.
- Action success: `Haptics.notificationAsync(Success)`.

## 10. Responsive (tablet)
- ≥ 768pt: split view — list left (320pt), detail right.
- Selected row highlighted; back gesture irrelevant inside split.

## 11. i18n keys
- `chat.list.title`, `chat.list.search.placeholder`
- `chat.list.filter.{all|unread|mentions|tax|gst|loan|bug}`
- `chat.list.row.you` ("You: "), `chat.list.row.typing` ("typing…")
- `chat.list.empty`, `chat.list.error.load`
- `chat.list.swipe.{resolve|mute|markUnread|pin}`
- `chat.list.fab.new` ("New conversation")

## 12. Components used
ThreadRow (extended), CategoryBadge (new), Avatar (with status dot), SwipeRow primitive (existing), SearchInput, FilterChipRow, EmptyState, Skeleton, FAB, Sheet (new-thread).
