# Keyboard Shortcuts Specification (Phase 6F)

> Phase 6F · Track F1 · Owner: ui-ux-agent → frontend-dev.

## 1. Purpose
Provide power-user shortcuts (Gmail-style g-prefix navigation, single-key actions in lists, `?` cheat-sheet) and a discoverable overlay so users learn them organically.

## 2. Conventions
- `g {x}` — global navigation (two-key chord, must be pressed within 1500ms; visual hint after `g`).
- `cmd/ctrl + {key}` — universal cross-app shortcut (palette, save, search).
- Single key (no modifier) — context-only (e.g., `j/k` in lists). Suppressed inside text inputs.
- `?` — open cheat-sheet (always available outside inputs).

## 3. Global shortcut map

### 3.1 Navigation chords (`g` prefix)
| Chord | Goes to |
|---|---|
| `g h` | Dashboard (Home) |
| `g u` | Users / Orgs |
| `g d` | Documents |
| `g a` | Accounting |
| `g g` | GST |
| `g i` | ITR |
| `g l` | Loans |
| `g b` | Bank Comms |
| `g c` | Callbacks |
| `g k` | Chat (k = "kommunication" — `c` is callbacks) |
| `g r` | Reports |
| `g n` | Notifications |
| `g s` | Subscriptions (ADMIN) |
| `g t` | Team (ADMIN) |
| `g ,` | Settings |

If the second key is invalid, swallow and show toast "Unknown shortcut: g {x} — press ? for help".

### 3.2 Universal
| Combo | Action |
|---|---|
| `cmd/ctrl + k` | Open command palette |
| `cmd/ctrl + /` | Focus current page's search/filter input |
| `cmd/ctrl + s` | Save (in editable forms — prevents browser save) |
| `cmd/ctrl + Enter` | Submit current form |
| `?` | Open shortcuts cheat-sheet |
| `Esc` | Close any modal/drawer/palette |
| `t` (when toast visible) | Focus most-recent toast for keyboard dismiss |

### 3.3 List context (any DataTable / list page)
| Key | Action |
|---|---|
| `j` | Next row |
| `k` | Previous row |
| `Enter` | Open selected row |
| `x` | Toggle row selection |
| `Shift + x` | Range select |
| `a` | Select all visible |
| `e` | Edit selected (when role allows) |
| `Delete` / `Backspace` | Soft-delete (with confirm modal) |
| `r` | Refresh |
| `f` | Open filter drawer |

### 3.4 Detail-page actions
| Page | Key | Action |
|---|---|---|
| Callback detail | `r` | Reschedule |
| | `c` | Complete (if role allows) |
| | `n` | Add note |
| ITR review | `a` | Approve |
| | `d` | Decline / decline-with-reason |
| | `c` | Recompute |
| Notice detail | `r` | Mark responded |
| | `u` | Upload attachment |
| Chat thread | `Enter` (in input) | Send |
| | `Shift+Enter` | New line |
| | `cmd/ctrl + Up` | Edit last sent message |

## 4. `?` Cheat-sheet overlay

### 4.1 Trigger
`?` (or `Shift + /` on keyboards where ? requires shift). Suppressed when focus is in `input`, `textarea`, `[contenteditable]`.

### 4.2 Layout
- Modal-style; 720px wide; max 80vh; scrollable.
- Header: "Keyboard shortcuts" + role pill ("Showing for: CA").
- Two-column grid; sections: Navigation · Universal · List · Page-specific.
- Each row: `<kbd>` chips on left + label on right.
- Footer search input ("Filter shortcuts…") narrows the list live.
- `Esc` closes.

### 4.3 Role-aware
The list filters per current role + current route — page-specific section reflects the page user is on (or "Open a list page to see list shortcuts").

### 4.4 Empty / loading / error
None — content is static + role-filtered locally; no network.

## 5. Discovery hints

- First-time login: subtle toast 8s "Press `?` to see all shortcuts" once per user (dismissible, never reappears).
- After 5 mouse-clicks on the same nav entry without ever using its `g` chord, show a one-time hint tooltip on hover: "Tip: press `g {x}` to jump here."

## 6. Conflict handling
- macOS browser uses `cmd+k` for address-bar search in some browsers — our shortcut takes priority because it is page-scoped and we `preventDefault()`. Document this in onboarding.
- `cmd+s` is intercepted only on forms with unsaved changes; otherwise fall through.
- Within text inputs, `?` types a question mark (no overlay).

## 7. i18n
Shortcut keys themselves are NOT translated (they map to physical keys). Labels and descriptions ARE translated. `<kbd>` chips render the symbol regardless of locale.

Keys:
- `shortcuts.title`
- `shortcuts.section.nav`, `shortcuts.section.universal`, `shortcuts.section.list`, `shortcuts.section.page`
- `shortcuts.filter.placeholder`
- `shortcuts.tip.firstUse`
- `shortcuts.unknown.toast` (with `{{key}}` interpolation)

## 8. Accessibility
- `<kbd>` elements include `aria-label` ("Command K") for screen readers.
- Cheat-sheet modal: focus-trap, ESC close, heading focused on open.
- All shortcut-triggered actions also have a visible UI affordance — keyboard is enhancement, not the only path.

## 9. Responsive
- < 768px: shortcuts overlay still works for hardware keyboards (BT) but `?` hint hidden by default.
- Touch users: cheat-sheet remains accessible from Settings > "Keyboard shortcuts".

## 10. Telemetry
- `kbd.shortcut_used { combo }` — non-PII; helps prioritize future shortcuts.
- `kbd.cheatsheet_opened { source }`.

## 11. Test plan
- [ ] Every chord in §3 navigates to the correct route in <100ms.
- [ ] All single-keys are inert inside inputs / textareas / contenteditable.
- [ ] Cheat-sheet filters live as user types.
- [ ] Hint toast shows once and never again per user.
- [ ] `cmd+s` prevents browser-save on edit forms.
