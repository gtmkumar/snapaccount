# Dark Mode (Mobile)

> Phase 6F · Track F4 · Mirrors `docs/design/admin/design-system/dark-mode-spec.md` for React Native + NativeWind.

## 1. Purpose
Native dark theme that follows system by default, supports manual override, persists across launches, is reviewed per-screen for legibility (especially loan & ITR disclaimers).

## 2. Token mirror

NativeWind exposes tokens as Tailwind colors plus a `dark:` prefix. The token names match the admin spec one-to-one. Tokens are loaded from `tokens.json` and split into `light` / `dark` maps consumed by a ThemeProvider that injects them into NativeWind's runtime config.

| Web token | RN consumer | Notes |
|---|---|---|
| `--surface-canvas` | `theme.surface.canvas` | App root bg |
| `--surface-raised` | `theme.surface.raised` | Card, Sheet, Modal |
| `--surface-sunken` | `theme.surface.sunken` | Inputs, list cells |
| `--text-primary` | `theme.text.primary` | Body |
| `--text-secondary` | `theme.text.secondary` | Subtitles |
| `--brand-500` | `theme.brand.500` | Primary actions |
| `--shadow-md` | `theme.shadow.md` | iOS = `{shadowColor, shadowOpacity, shadowOffset, shadowRadius}`, Android = `elevation: 4` |

Light/dark mappings identical to web spec §3.

## 3. Theme provider

`<ThemeProvider>` at root reads:
1. `SecureStore` (or `AsyncStorage` for theme since not sensitive) — `theme: 'system'|'light'|'dark'`.
2. If 'system', subscribe to `Appearance.addChangeListener`.

Tokens injected via React Context AND NativeWind `cssInterop` so both `<Text className="text-text-primary">` and inline-styled components resolve correctly.

## 4. Toggle UX

Three places to change theme:
1. **Settings > Appearance** — three radio cards (System / Light / Dark) each with a tiny preview card.
2. **Quick toggle in Profile sheet** — single button cycling System → Light → Dark.
3. (No iOS Control-Center integration — relies on system setting if "System" chosen.)

Persistence:
- Local: AsyncStorage.
- Server: `PATCH /me/preferences { theme }` debounced.
- On login from another device, server pref overrides local if newer (last-write-wins).

Animation: 220ms cross-fade on color tokens via Reanimated shared value; respects reduce-motion (instant).

## 5. Per-screen review

Every Phase 6A–E screen must be screenshotted in both themes, attached to `docs/design/screenshots/phase-6f-mobile-dark/{screen}.png`. Specific concerns:

| Screen | Dark-mode focus |
|---|---|
| `LoanPackagePreviewScreen` | Disclaimer card legibility on warning bg dark; PDF page itself stays white-paper (do not invert PDF content). |
| `LoanConsentScreen` | Long T&C text is `--text-primary` on `--surface-raised`; signature block sticky shadow visible. |
| `ITRFilingSummaryScreen` | Currency tabular-nums readable; DeltaPills accessible (color + sign). |
| `RefundTrackerScreen` | StatusTimeline pulse visible; reduced-motion fallback static. |
| `RegimeComparisonScreen` | Bars use lifted-saturation in dark; recommended bar still distinguishable. |
| `CameraScreen` | Camera viewport stays its own (live), but UI chrome (record button, close) transitions to dark surface. |
| `ChatDetailScreen` | Self-bubble brand-400 vs other-bubble surface-sunken still distinguishes; read receipts double-check has 4.5:1. |
| `NoticeInboxScreen` | Severity colors preserved; warning never inverted. |
| `LoanHubScreen` | LoanProductCard borders visible; qualification chip readable. |

## 6. PDF + WebView content rule

`PdfViewerMobile` and any embedded WebView preserve their source's color (do not auto-invert) — financial documents must look identical in both themes. The container chrome around them swaps; the content does not.

## 7. Empty / loading / error
- Skeleton uses dark token shimmer (`slate.800 → slate.700 → slate.800`).
- EmptyState illustrations use `currentColor` → adapt automatically.
- Error toasts retain semantic colors (rose remains rose).

## 8. Accessibility
- Toggle button: `accessibilityLabel="Theme: {{current}}, double-tap to cycle"`.
- Theme change: `AccessibilityInfo.announceForAccessibility('Theme changed to dark')`.
- All semantic colors (success/warn/error/info) verified ≥ 4.5:1 against both surfaces.
- Status indicators always pair color with icon AND label.
- Reduce-motion respected on theme transition.

## 9. System integration
- iOS: respects "Reduce White Point" / "Smart Invert" (we don't double-invert).
- Android: respects `Appearance` API + per-app setting overrides.
- Status bar style: `light-content` in dark, `dark-content` in light — managed via `expo-status-bar` `style="auto"` plus our theme value.

## 10. i18n keys
Reuse from web (`theme.toggle.*`).

## 11. Settings UI

Settings > Appearance section:
- Heading "Appearance".
- Three radio cards.
- Card preview: 84pt tall, mini-screen mockup.
- Footer note: "Choose System to follow your phone's theme."

## 12. Test plan
- [ ] Launch with system dark + theme=system → app paints dark before first frame (no flash).
- [ ] Toggle while on each tab — no jank, no orphan light-mode children.
- [ ] Loan disclaimer + ITR notice text screenshotted in dark and verified ≥ 4.5:1.
- [ ] Camera UI chrome adapts; viewport unaffected.
- [ ] Server pref overrides local on login from another device.

## 13. Components used / extended
ThemeProvider (new), ThemeRadioCard (new — Settings), all existing components consume tokens (no per-component code changes; only ensure no hard-coded hex remains).
