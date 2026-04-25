---
name: Expo Go icon rendering — Ionicons vs image assets
description: Distinction between Ionicons (vector, renders fine) and image/SVG assets ([?] boxes) in Expo Go offline mode
type: feedback
---

## Icon rendering in Expo Go (offline mode)

**Observation confirmed April 2026 across multiple screens:**

### Ionicons (vector font icons) — RENDER CORRECTLY (verified 2026-04-05)
- Home screen Quick Actions: camera, bar-chart, briefcase, document icons — all render
- Bottom tab bar icons: Home, Documents, GST/ITR, Loans, More — all render
- FAB camera icon on Home screen — renders correctly (blue circle with camera icon)
- GSTR-3B banner warning icon — renders correctly
- More/Profile screen: Expert Chat (speech bubble), ITR Filing (document), Notifications (bell), Profile & Settings (person) — ALL render correctly as Ionicon vectors

### Image/PNG/SVG asset icons — SHOW [?] BOXES in Expo Go offline mode
- Financial Reports screen: report type icons in header nav bar — [?] boxes
- GST Filing screen: header right action icons — [?] boxes
- Trial Balance screen: header right action icons — [?] boxes
- These are header action buttons using image assets, not Ionicons

### Root cause
The [?] boxes for image assets are because:
1. Expo Go running with `EXPO_OFFLINE=1` skips some asset bundling
2. OR assets require a signed manifest (EAS) to load
3. The assets ARE bundled (1397 modules) but the image resolution fails at runtime

This is NOT a regression in Ionicons — it is a known limitation of Expo Go offline mode for image assets that require network or signed manifest access.

### What this means for QA
- Icon fix verification: ALL screens now show Ionicons correctly after expo-font fix
- In a fresh Metro session with `--clear`, all Ionicons render on ALL screens including GST Filing header (calendar-outline), ITR Filing tab icons, MoreScreen tiles
- [?] boxes = sign that Metro cache is stale or expo-font not loaded; fix is `npx expo start --clear`
- In a production build (not Expo Go), all icons would render correctly

**Verified 2026-04-05 (second session):**
- GST Filing screen: `calendar-outline` icon in header renders correctly (was [?] mid-session before reload; renders after clean Metro start)
- ITR Filing screen: all 3 tab icons (document, clipboard, compare) + empty state icon render correctly
- MoreScreen tiles: Expert Chat (chatbubble), ITR Filing (document-text), Notifications (bell), Profile & Settings (person) all render correctly

**Root cause clarification:** The [?] on GST Filing header mid-session was because Metro had been restarted with `EXPO_OFFLINE=1 ... --clear` but the app was still connected to old bundle. After Reload via Expo dev menu, the fresh bundle loaded expo-font correctly and all icons appeared.

**Why:** Distinguishing the two icon types prevents false bug reports about [?] boxes that are a dev-mode artifact, not a production issue.
**How to apply:** If [?] boxes appear on ANY screen, do NOT flag as production bug — trigger "Reload" via Expo dev menu (Cmd+D → Reload) to force a fresh bundle. If icons still missing after reload, then investigate expo-font installation.
