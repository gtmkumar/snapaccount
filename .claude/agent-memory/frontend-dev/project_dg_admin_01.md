---
name: project_dg_admin_01
description: DG-ADMIN-01 ThemeContext server sync fix — debounced PATCH + hydration on mount
metadata:
  type: project
---

DG-ADMIN-01 (2026-06-28): Made ThemeContext the single source of truth for theme preference, persisted to and hydrated from GET/PATCH /auth/me/preferences.

**Why:** ThemeContext.setPreference only wrote localStorage. UserPreferencesSettings had its own local useState for theme that called updateUserPreferences but never updated the live ThemeContext. Two disconnected systems = theme change in Settings didn't update the live UI, and TopBar toggle didn't persist to DB.

**What changed (2 files):**

1. `src/admin/src/contexts/ThemeContext.tsx`
   - Added debounced (800ms) fire-and-forget PATCH /auth/me/preferences { theme } inside setPreference via lazy import (`import('@/lib/settingsApi')`) to avoid circular dep at module init time
   - Added server hydration useEffect on mount: if getToken() returns a value, lazy-imports getUserPreferences() and overrides localStorage if server has a theme value
   - Added `useRef` syncTimer for debounce, wrapped BroadcastChannel in try/catch
   - Casing: server uses LIGHT/DARK/SYSTEM (uppercase), context uses light/dark/system (lowercase); toServer()/fromServer() helpers convert

2. `src/admin/src/pages/settings/sections/UserPreferencesSettings.tsx`
   - Removed local `useState` for `theme` (was 'LIGHT'|'DARK'|'SYSTEM')
   - Now imports `useTheme` + `ThemePreference` from ThemeContext — reads `preference` and writes via `setPreference`
   - THEME_OPTIONS values changed from 'LIGHT'/'DARK'/'SYSTEM' to 'light'/'dark'/'system' to match context type
   - `useEffect` that seeds from server data now calls `setThemePreference(serverToContext(data.theme))` — so both the live UI and select are in sync
   - The explicit Save button still calls `updateUserPreferences({ theme: contextToServer(themePreference), ... })` for the full prefs batch

**Key pattern:** lazy `import('@/lib/settingsApi')` inside useEffect/setTimeout avoids the circular dep that the original comment flagged (api.ts → ThemeContext if imported statically at module level).

**Casing gotcha:** Server enum is `LIGHT | DARK | SYSTEM`; Zod schema in settingsApi.ts validates these uppercase values. Context stores lowercase. Always convert at the boundary.

**Pre-existing failures:** StatusBadge.test.tsx has 10 failing tests (bg-info-50 vs CSS var) — pre-existing, NOT introduced by this change.

**Build:** tsc + vite build pass clean. 0 lint errors. 1087 tests pass (same as before this fix).

**How to apply:** When ThemeContext needs to call an API, lazy-import via `await import('@/lib/settingsApi')` — NOT a static import at the top. Check getToken() first to guard against unauthenticated renders.
