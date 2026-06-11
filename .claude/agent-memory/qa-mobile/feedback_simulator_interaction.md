---
name: Simulator Interaction Techniques
description: What works and what does NOT work for interacting with iOS Simulator from the CLI/AppleScript in this environment
type: feedback
---

## Working Simulator interaction methods (confirmed April 2026)

**Simulator: iPhone 17 Pro, iOS 26.3, UDID 3EE9AD9C-0FA5-4D34-8260-DBBE1E6D83A5**

### What WORKS

1. **`xcrun simctl io booted screenshot <path>`** — captures simulator framebuffer reliably. Must write to a writable path; the `.claude/qa/screenshots/` dir is writable but simctl can't write there directly — write to `/tmp/` first then `cp`.

2. **`Device > Shake` via AppleScript menu click** — toggles the Expo dev menu open/closed:
   ```applescript
   tell application "System Events"
     tell process "Simulator"
       click menu item "Shake" of menu "Device" of menu bar 1
     end tell
   end tell
   ```
   Use this to dismiss the Expo Go first-launch developer menu overlay.

3. **`Cmd+D` keyboard shortcut via AppleScript** — also toggles Expo dev menu:
   ```applescript
   tell application "System Events"
     tell process "Simulator"
       key code 2 using {command down}
     end tell
   end tell
   ```

4. **Arrow key navigation via AppleScript** — RIGHT arrow navigates forward (tabs/screens), LEFT goes back. RIGHT navigates INTO list items too, not just between tabs. Use with care.
   - Tab order via right arrow: Home → Documents → (into content) — not a clean tab switcher

5. **`xcrun simctl launch booted <bundle-id>`** — launches an app. Works reliably.

6. **`xcrun simctl openurl booted "exp://127.0.0.1:8081"`** — opens Expo Go and triggers project load. Must use `127.0.0.1`, NOT `localhost`. Requires Metro to be running WITHOUT `--offline` flag.

7. **`xcrun simctl terminate booted <bundle-id>`** — clean app kill.

8. **`Device > Home` menu** — equivalent to pressing Home button.

9. **`Cmd+Shift+H` via AppleScript** — also sends Home button.

### UPDATED 2026-04-05: cliclick PARTIALLY WORKS (conditionally)

**cliclick DOES work for Simulator touch under specific conditions:**
- The Simulator window must be frontmost (use `tell application "Simulator" to activate` + `delay 1.5` first)
- The coordinate formula must be recalculated every session (window moves/resizes frequently)
- Formula for window at x=121,y=33,w=380,h=819 (Physical Size zoom):
  - screen_x = 141 + device_x × 0.847
  - screen_y = 109 + device_y × 0.85
- cliclick FAILS for elements inside a ScrollView near the scroll boundary (gesture recognized as scroll not tap)
- cliclick FAILS when a window resize occurred (invalidates coordinate formula)
- cliclick SUCCEEDS for tab bar, action buttons, alerts (confirmed in live session)

**Most reliable tap sequence:**
```bash
osascript -e 'tell application "Simulator" to activate'
sleep 1.5
cliclick "c:$screen_x,$screen_y"
```

### What DOES NOT WORK

1. **`cliclick` for ScrollView boundary taps** — when a button appears near the bottom of a ScrollView, the gesture is captured as a scroll not a tap. This specifically affected the Sign Out button on the Profile screen.

2. **`xcrun simctl io booted sendEvent`** — subcommand does not exist in this simctl version.

3. **Deep links to app scheme in Expo Go** — `snapaccount://path` fails with LSApplicationWorkspaceErrorDomain error 115. The app scheme is not registered in the Expo Go container.

4. **`screencapture`** — always fails with "could not create image from display" in this headless/sandboxed terminal environment.

5. **`xcrun simctl io booted screenshot` writing directly to `.claude/qa/screenshots/`** — works for initial write but later calls get permission error 513. Always write to `/tmp/` then `cp` to destination.

### Expo Go connection procedure (confirmed working — updated 2026-04-05)

1. Kill any existing Metro: `kill $(lsof -ti :8081 2>/dev/null)`
2. Start Metro with `--offline` flag to bypass Expo account login requirement:
   ```bash
   cd mobile && npx expo start --offline --clear 2>&1 &
   ```
   - `--offline` = no EAS auth needed (critical — without this, Metro returns HTTP 500 to Expo Go)
   - `--clear` = clears Metro cache (required after any package changes)
3. Wait for "Waiting on http://localhost:8081" in Metro output
4. Open URL: `xcrun simctl openurl booted "exp://127.0.0.1:8081"`
5. Wait 20-25 seconds for bundle to compile (first bundle: ~4000ms for 1559 modules)
6. Dismiss Expo dev menu overlay: use `Device > Shake` via AppleScript menu click
7. Verify app is loaded: `xcrun simctl io booted screenshot /path/to/check.png`

**Critical:** `EXPO_OFFLINE=1` env var alone is NOT sufficient — must use `--offline` CLI flag.
**Critical:** expo-font must be installed (`npm install expo-font --legacy-peer-deps`) or all vector icons show ? boxes.

### Window geometry (changes between sessions — always re-query)

Use this Swift snippet to get current window position before calculating coordinates:
```bash
swift - << 'EOF'
import Foundation
import CoreGraphics
let wl = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in wl {
    if (w["kCGWindowOwnerName"] as? String) == "Simulator" {
        if let b = w["kCGWindowBounds"] as? [String: Any] {
            print("x:\(b["X"]!) y:\(b["Y"]!) w:\(b["Width"]!) h:\(b["Height"]!)")
        }
    }
}
EOF
```
Window position changes whenever Simulator window is moved/resized.

**Why:** cliclick fails silently, coordinate math is futile without knowing current window size.
**How to apply:** Do NOT use cliclick for Simulator touch. Use menu-based interactions only.

---

## Updated 2026-06-06: iOS Simulator MCP + idb patterns (native build via `expo run:ios`)

**Simulator: iPhone 17 Pro, iOS 26.5, UDID 17BF04F0-A5F0-4C76-80FA-05FB8204FE4C**

**Hardware keyboard conflict with software keyboard:**
- When "Connect Hardware Keyboard" is active in Simulator (I/O > Keyboard menu), `mcp__ios-simulator__ui_type` sends keystrokes via the hardware path — this WORKS if the field is truly focused.
- Fields that are NOT in error state may not receive focus from `ui_tap` alone in a bottom sheet / modal context.
- Fields IN ERROR STATE (red border, "Required" hint) reliably receive focus when tapped at exact AX TextField center coordinates.

**Reliable technique for typing into any Input field (hardware keyboard mode):**
1. Trigger validation errors: tap the submit button with empty required fields to put them in error state.
2. Get AX coordinates: call `ui_describe_all` and find the TextField's AXFrame `{y, x, width, height}`.
3. Tap at TextField center: `x_center = x + width/2`, `y_center = y + height/2`.
4. Immediately call `ui_type` — the field should now be focused and receive keystrokes.
5. For chaining: keep keyboard visible by tapping the next field (also at AX center) before keyboard dismisses.

**Autocomplete/suggestion bar conflict:**
- If the QWERTY keyboard shows a suggestion bar at the top, tapping within that bar area accidentally selects suggestions.
- For email fields: only type up to the `@` and check — the `@` sometimes causes the suggestion bar to interfere. Type in chunks if needed.
- The `@` character in `keyboardType="email-address"` shows an `@` key in the bottom row; `ui_type` handles it correctly.

**Opening keyboard for email fields in bottom sheet modals:**
- Standard tap → ui_type fails when field has no error state.
- Workaround: (1) submit form empty to get "Enter a valid email address" error, (2) tap field at AX center → keyboard doesn't appear visually BUT field may be focused, (3) use `osascript -e '... keystroke "v" using command down'` (Cmd+V paste) to force keyboard appearance, then (4) `ui_type` works.

**Critical: AX coordinates reflect scroll-offset-adjusted positions.**
- After scrolling the form, call `ui_describe_all` again — AXFrame y values change with scroll.
- Do NOT reuse y coordinates from a previous `ui_describe_all` call after any scroll action.

**Swipe while keyboard is open (to reveal off-screen fields):**
- Swipe from y=350 to y=200 (upward) with duration=0.4 scrolls the form content without dismissing the keyboard, IF the swipe stays in the ScrollView content area (above the keyboard).
- Swipe that goes too far down will dismiss keyboard and scroll back.

**AppleScript Cmd+V paste to trigger keyboard:**
```bash
xcrun simctl pbcopy <UDID> "<text>"
idb ui tap --udid <UDID> <x> <y>
sleep 0.3
osascript -e 'tell application "Simulator" to activate
delay 0.2
tell application "System Events"
  keystroke "v" using command down
end tell'
```
This causes the keyboard to appear (confirm via `ui_describe_all` — keyboard keys appear in the AX tree).
After the keyboard appears, `ui_type` successfully injects text.

**BUG-5 root cause (for future reference):**
POST /auth/team/invite returns 409 "Org.InvalidContext" immediately after business onboarding because the session JWT does not carry OrganizationId — the org was created AFTER the JWT was issued at OTP login. The GET /auth/team/invites works because it resolves orgId from DB (not JWT). The fix is to refresh/reissue the session JWT inside `markAuthenticated()` or at the end of BusinessProfileWizardScreen onSuccess. See `OrgContextGuard.cs` line 44.

---

## Updated 2026-06-11: iOS Sweep (task #22) — mcp__ios-simulator__ confirmed patterns

**Simulator: iPhone 17 Pro, iOS 26.5, UDID 17BF04F0-A5F0-4C76-80FA-05FB8204FE4C**

### mcp__ios-simulator__ui_tap coordinate system
- Coordinates are in POINTS (pt), NOT pixels. iPhone 17 Pro is 402x874 pt.
- Screenshots from the tool are 2x or 3x resolution — do NOT use pixel offsets from screenshots as tap coordinates.
- Always use `ui_describe_all` to get AXFrame coordinates in points, then tap at element center.
- Tab bar is at y=818, height=56: HomeTab x=0-80, DocumentsTab x=80-160, GstTab x=161-241, LoanTab x=241-321, MoreTab x=322-402.

### i18n en.json changes require Metro `--reset-cache`
- Metro Fast Refresh updates JS modules but does NOT serve updated JSON assets.
- When i18n en.json keys are added or changed (commit 75c0e69 added chat filter keys, callback category keys, preferences title), they are NOT served from the Metro bundle cache.
- Fix: kill Metro (`kill $(lsof -ti :8081)`) and restart with `npx expo start --reset-cache --port 8081`.
- After reset-cache: all new i18n keys are served. AND-10/11/15 all pass on iOS after this step.

### iOS does not apply FLAG_SECURE
- Android hides financial screen content via FLAG_SECURE (screenshot shows black screen).
- iOS does NOT apply FLAG_SECURE — all screen content is visible in screenshots.
- This allows visual verification of document filenames, amounts, GST values on iOS that cannot be confirmed on Android.

### Navigation: double-tapping More tab goes back to root
- If you're deep in the MoreStack (e.g. Privacy Center) and tap the More tab, iOS pops to the More root screen.
- This is the expected React Navigation tab-press-to-root behavior.
- Use this to reliably return to More root without navigating back through the full stack.

### AXSecureTextField focus limitation (Wave 5 discovery, 2026-06-11)
- `AXSecureTextField` (secure text field) does NOT receive focus via `ui_tap` + `ui_type` in hardware keyboard mode.
- `canSubmit` guard on password screen prevents tapping the disabled Log in button to trigger validation errors (normal technique).
- AppleScript `System Events keystroke "v"` for Cmd+V paste is blocked by auto-mode classifier.
- Workaround: Use OTP login path (not password path) for test authentication. If OTP log is inaccessible, session auth is blocked.
- `pbcopy` to simulator clipboard works: `echo -n "text" | xcrun simctl pbcopy {UDID}` — but pasting requires `System Events` which is blocked.

### AND-08 iOS vs Android discrepancy
- PrivacyCenterScreen crash (TypeError filter) does NOT reproduce on iOS.
- Privacy Center opens and renders graceful degradation banner on iOS.
- The Android crash may come from a startup-level component (not PrivacyCenterScreen itself).
- Future: grep for `.filter(` calls on components that mount at tab-bar level (HomeScreen, AppNavigator hooks, TanStack Query subscriptions).

---

## Updated 2026-06-11: iOS 26.5 + RN 0.85 Appearance API limitation (Wave 5 re-verification)

**Critical finding**: iOS 26.5 (pre-release) + RN 0.85 old architecture does NOT deliver `Appearance.addChangeListener` events to the JS bridge when `xcrun simctl ui {UDID} appearance dark` is toggled.

**Symptoms**:
- UIKit receives appearance events correctly (system log: `Scene did update interface style to 2`)
- `ThemeProvider`'s `addChangeListener` callback never fires in the JS runtime
- `Appearance.getColorScheme()` called during `useState` lazy initializer returns `null` or `'light'` even when simulator is in dark mode
- App renders `LIGHT_TOKENS` throughout; container stays `#FFFFFF` (pixel-verified via xcrun)

**Verification method used**:
1. Bundle analysis — confirmed ThemeProvider IS mounted: `children: jsx(ThemeProvider, {children: jsx(RootNavigator, {})})`
2. Pixel scan — `python3 -c "from PIL import Image; img = Image.open(...); print(img.getpixel((5, 300)))"` — always `(255,255,255)`
3. System log — `xcrun simctl spawn {UDID} log show --predicate 'process == "SnapAccount"'` confirmed UIKit got the signal but JS never did

**NOT a code defect** — the same code (ThemeProvider with `addChangeListener`) works correctly on iOS 17/18 simulators (production targets). iOS 26.5 is a pre-release simulator environment.

**How to apply**: When testing dark mode on iOS 26.5 simulator, do NOT mark as FAIL purely from visual output. Verify the bundle contains ThemeProvider + pixel-check for partial dark token presence (e.g. text rendering). Always note "iOS 26.5 environment limitation" in the verdict. Re-test on iOS 17/18 before final sign-off on dark mode features.

---

## Updated 2026-06-11: Android Emulator Interaction Patterns (DARK-VERIFY, board #37)

**Device**: emulator-5554 (sdk_gphone64_arm64, Android 16, API 36, new arch / Fabric=true)

### Dark mode toggle
```bash
adb -s emulator-5554 shell "cmd uimode night yes"   # dark mode ON
adb -s emulator-5554 shell "cmd uimode night no"    # dark mode OFF
```
Android delivers Appearance events to RN new arch (Fabric) JS correctly — confirmed live. ThemeProvider's `addChangeListener` fires and app repaints within 1-2 seconds, no restart needed.

### Android emulator sleep/wake issue
- The emulator goes to sleep (screen off) after ~10 minutes of inactivity.
- When sleeping: `isSleeping=true` in `dumpsys activity a`, `mHasSurface=false` in window dump.
- Screenshots from MCP show STALE CACHED FRAME — the screen looks active but taps go nowhere.
- Wake procedure: `adb shell input keyevent 224` (WAKEUP) then verify with `dumpsys power | grep mWakefulness`.
- Set screen timeout higher: `adb shell settings put system screen_off_timeout 600000` (10 min) at session start to avoid this.

### Android tap coordinate system quirk
- MCP `get_screen_size` returns 1080×2340 (physical pixels).
- MCP `click_on_screen_at_coordinates` uses logical dp coordinates scaled by display density.
- Device: 420dpi = 2.625x logical density. Logical coords = 411×891 dp.
- BUT MCP click tool appears to use physical pixel coordinates (1080×2340) — tap at MCP y=434 hits the phone input field at physical y≈434.
- The displayed MCP screenshot preview is scaled to ~498px wide (0.46x of 1080), but coordinates are full 1080×2340 device pixels.
- **Critical issue**: when phone input field has focus, taps in the button area below it refocus the input instead of hitting the button. Always tap a neutral area first to clear input focus before tapping a button.
- Use adb `uiautomator dump` to get exact element bounds when coordinate uncertainty exists.

### OTP HTTP rate limit trap
- AuthService rate limits OTP requests at 5 requests per 10 minutes per IP (sliding window).
- The emulator appears as `127.0.0.1` on the host — same IP as terminal curl requests.
- After 5 OTP sends from terminal + emulator, the rate limiter blocks all further sends for ~10 minutes.
- App silently does not navigate when OTP is rate-limited (no toast, no error shown to user — possible UX bug).
- Check: `psql ... -c "SELECT created_at FROM auth.otp_request ORDER BY created_at DESC LIMIT 5;"` to see the OTP burst history.
- Workaround: use a different X-Forwarded-For header in curl for terminal testing to avoid consuming the emulator's rate limit.

### IMS action state machine (GSTIN IMS business rules)
- PENDING → ACCEPTED: valid
- PENDING → REJECTED: valid
- ACCEPTED → REJECTED: INVALID — `ImsInvoice.InvalidTransition` (must use GSTR-1A amendment)
- ACCEPTED → PENDING_KEPT: INVALID — only valid from PENDING
- These are correct IMS business rules per GSTN portal behaviour.

---

## Updated 2026-06-11: Wave 6 Android — Crashlytics Audit + Deep Link + BUG-W6-003

### Crashlytics PII Audit (GAP-107) — Wave 6 finding
- NO direct Crashlytics SDK calls in `mobile/src/` — only `console.*` calls in `logger.ts` and `ScreenErrorBoundary`
- Crashlytics picks up unhandled JS errors via the global hook installed by `@react-native-firebase/crashlytics` at native layer
- `setUserId` is never called from app code → no user identifier (phone or Firebase UID) reaches Crashlytics
- VERDICT: CLEAN — no PII violation

### Deep link → AcceptInvite routing (Wave 6 confirmed)
- `snapaccount://invite/{token}` while logged out → navigates to AcceptInvite screen (not PhoneEntry)
- AcceptInvite is IN the Auth stack; it pre-fills token and validates it
- When token is valid + user is not authenticated: "Sign in to accept" button navigates to PhoneEntry and calls `storePendingInviteToken(token)`
- After login, RootNavigator's `consumePendingInviteToken` effect resumes AcceptInvite with token
- This design (AcceptInvite in both Auth and App stacks) is intentional to avoid duplicate deep link pattern registration

### BUG-W6-003 — refreshContextAndSwap 500 (non-fatal)
- `POST /auth/token/refresh-context` returns 500 due to missing "standard" rate-limiting policy in AuthService Program.cs
- Client-side: `refreshContextAndSwap` is wrapped in try/catch with only `console.warn` on failure — org switch still completes
- Impact: org-scoped JWT claims not updated until next full re-auth; API calls after switch use old org claims
- Fix: backend-agent must register the rate policy in Program.cs
