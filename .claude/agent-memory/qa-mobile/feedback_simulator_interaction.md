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
