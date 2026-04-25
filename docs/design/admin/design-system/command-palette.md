# Command Palette Specification (Phase 6F)

> Phase 6F · Track F1 · Owner: ui-ux-agent → frontend-dev.

## 1. Purpose
Global, keyboard-first launcher (cmd+k / ctrl+k) for power users (ADMIN, CA, LOAN_OFFICER, OPS) to jump to entities and actions in <2 keystrokes. Reduces nav clicks, especially valuable for CAs handling many filings.

## 2. User goal
"I'm assigned 30 ITR filings and 12 GST notices. I want to type a name or PAN and land on the right page in one second."

## 3. Trigger
- Keyboard: `cmd+k` (mac) / `ctrl+k` (windows). Globally bound except inside text inputs that capture the same combo (then a "Press cmd+k twice to open" hint shows).
- Click: header search icon (24×24, magnifier) opens the same palette.
- URL: `/?palette=open` deep-link convenience.

## 4. Layout

Modal-style overlay:
- 640 px wide, max 80vh.
- Centered, top: 12vh.
- Backdrop: `--surface-overlay`.
- Surface: `--surface-raised` + `--shadow-lg`.
- Border-radius: `radius.lg` (16px).

Internal structure (top to bottom):
1. **Search input row** — magnifier icon left, input flex-1 (no border, 18px font), `<kbd>esc</kbd>` chip right.
2. **Filter chips row** (optional): `All` (default), `Users`, `Documents`, `Returns`, `Callbacks`, `Loans`, `Notices`. Click toggles active filter.
3. **Result list** (flex-1, scrollable):
   - **Section: "Recent"** — last 5 visited entities (only when input empty).
   - **Section: "Suggested actions"** — shortcuts ("New invoice", "Open dashboard").
   - **Section per entity type** when typing.
4. **Footer hint bar** — `↑↓` navigate · `↵` open · `tab` filter · `esc` close.

Empty input shows Recent + Suggested actions. Typing replaces with live results.

## 5. Search behavior

### 5.1 Targets
- **Users / Orgs** — by name, email, PAN, GSTIN, phone (last 4).
- **Documents** — by filename, OCR title, doc-id last-4.
- **GSTR returns** — by period (e.g., "GSTR-1 Mar 26"), GSTIN.
- **GST notices** — by section (143(1), 156), reference number.
- **Callbacks** — by user name, status, callback ID.
- **Loan applications** — by applicant, loan ID, bank, status.
- **ITR filings** — by user, AY, ITR form (e.g., "ITR-2 AY26-27").
- **Plans / Subscriptions** — by name (admin only).

### 5.2 Backend
- Single endpoint: `GET /search?q={query}&types={comma}` (admin scope).
- Server-side fuzzy match (Postgres `pg_trgm`); per-type rank limit 5; total cap 25.
- Latency budget: P95 < 250ms warm, < 600ms cold.
- Debounce: 180ms after keystroke.

### 5.3 Result row
| Column | Content |
|---|---|
| Icon (24px) | Entity-type icon, colored per module accent |
| Primary | Entity name / title (truncate ellipsis) |
| Secondary | Subtitle (e.g., "PAN ABCDE1234F · 3 returns") |
| Right | Type chip ("User", "Notice"), `↵` hint on hover |

Hover/focused row: `--surface-sunken` bg + 2px left border `--brand-500`.

### 5.4 Result actions
- Primary `Enter`: navigate to entity detail page.
- `Cmd+Enter`: open in new tab.
- `Cmd+.`: copy entity ID to clipboard (with toast "ID copied").

## 6. Keyboard navigation

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection within results, wraps at edges |
| `Tab` / `Shift+Tab` | Cycle filter chips |
| `Enter` | Open selected |
| `Cmd/Ctrl + Enter` | Open in new tab |
| `Cmd/Ctrl + .` | Copy ID |
| `Esc` | Close palette (focus returns to trigger) |
| Typing letters | Replaces query; selection resets to first result |
| `Cmd+K` while open | Close (toggles) |

## 7. Recent items

- Stored in `localStorage.snapaccount.cmdk.recent` (max 25). Each item: `{ type, id, label, secondary, openedAt }`.
- Replaced LRU when exceeded.
- Cleared on logout.

## 8. Suggested actions (no query)

| Action | Required role | Shortcut |
|---|---|---|
| Go to Dashboard | all | `g h` |
| Open Users list | ADMIN | `g u` |
| Create Subscription plan | ADMIN | — |
| Open Callbacks queue | ADMIN/OPS | `g c` |
| Open Notifications | all | `g n` |
| Toggle theme | all | — |
| Sign out | all | — |

Suggestions are role-filtered; hidden when not allowed.

## 9. Empty / loading / error

- Empty (no recent, no query): friendly placeholder "Type a name, PAN, GSTIN, or invoice ID to jump anywhere."
- Loading: 3 skeleton rows (44px each), shimmer 800ms.
- No results: illustration (magnifier + question) + "No matches for {{query}}". CTA: "Search documents instead" if user has document scope.
- Error: "Search is offline — try again. {{retryLink}}"; rest of palette still navigable to recents.

## 10. i18n keys
- `palette.placeholder` ("Search anything…")
- `palette.section.recent`, `palette.section.actions`, `palette.section.users`, `palette.section.documents`, etc.
- `palette.empty.noResults` ("No matches for {{query}}")
- `palette.error.offline`
- `palette.hint.navigate`, `palette.hint.open`, `palette.hint.close`

Hindi/Bengali strings provided; ensure 40% string-length headroom. Indian script renders RTL-safe even though hi/bn are LTR.

## 11. Accessibility
- Combobox pattern: input is `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`.
- Listbox `role="listbox"`; rows `role="option"` with `aria-selected`.
- Focus trap inside palette while open; restore focus on close.
- Screen reader announces "Showing 12 results" via polite live region after debounce settles.
- High-contrast focus ring on selected row.

## 12. Responsive
- ≥ 768px: full overlay as described.
- < 768px: full-screen sheet (bottom-up animation), virtual keyboard friendly. Filter chips collapse into a dropdown.

## 13. Telemetry
- `cmdk.opened { source: 'kbd'|'click'|'url' }`.
- `cmdk.searched { len, hadResults }` (no raw query — privacy).
- `cmdk.opened_result { type }`.

## 14. Test plan
- [ ] Cold open → first paint < 100ms (palette CSS preloaded).
- [ ] 4 roles each see only allowed Suggested actions.
- [ ] Recent items round-trip across reload.
- [ ] Keyboard-only flow: open, type, navigate, open, all without mouse.
- [ ] Screen reader announces results count.
