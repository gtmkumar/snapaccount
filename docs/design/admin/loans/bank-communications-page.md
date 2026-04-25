# Admin — BankCommunicationsPage

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Cross-application audit log of every outbound and inbound bank message. Email adapter (SendGrid) traffic + REST/OAuth adapter calls are unified here. Used for compliance review, troubleshooting failed submissions, and demonstrating audit trails to partner banks.

## User Goal

"Show me every message we exchanged with banks. Filter by bank, status, channel. Let me drill in to see the actual payload."

---

## Layout

```
┌─ Breadcrumb  Loans / Bank communications ────────────────┐
│  PageHeader "Bank communications"                         │
│  KpiStrip                                                  │
│   [Sent today 24]  [Pending 3]  [Failed 2]               │
│   [Avg response 2h 14m]  [Bounce rate 0.4%]              │
│  ─────────────────────────────────────────────────────── │
│  FilterBar                                                 │
│   [Bank ▾]  [Channel ▾ Email/REST/OAuth]                 │
│   [Status ▾ sent/delivered/responded/failed]             │
│   [Direction ▾ outbound/inbound]                         │
│   [Date range]   [Search by app ID / message ID]         │
│  ─────────────────────────────────────────────────────── │
│  SplitView                                                 │
│   Left  60% — DataGrid                                    │
│    Time  Direction  Bank  Channel  App   Subject  Status │
│   Right 40% — DetailPane (preview of selected row)        │
│    Email: from / to / cc / subject / body / attachments  │
│    REST: endpoint / method / headers (masked) / payload  │
│    OAuth: token issuer / token scopes / response status  │
│   [Resend]  [Open app →]                                  │
└────────────────────────────────────────────────────────── ┘
```

---

## Components used

- `KpiStrip`, `FilterBar`, `SelectionToolbar`, `DataGrid` (existing).
- `BankAdapterTypeBadge` (new) for the Channel column.
- `BankCommStatusBadge` — variants: `queued` (neutral), `sent` (info), `delivered` (info), `responded` (success), `bounced` (error), `failed` (error).
- `PayloadViewer` (new — see component-library addendum) — JSON tree + raw toggle for REST payloads; sanitized HTML viewer for email body.
- `MaskedSecretRow` — reuse Phase 6E mask primitive (shows last 4, click to reveal w/ audit log).

## DataGrid columns

| Column | Width | Notes |
|---|---|---|
| ☐ | 40 | Bulk select |
| Timestamp | 160 | DD MMM YYYY HH:mm:ss IST |
| Direction | 80 | Arrow icon ↑ ↓ |
| Bank | 160 | logo + name |
| Channel | 110 | BankAdapterTypeBadge |
| App | 120 | Link to LoanDetailPage |
| Subject / Endpoint | flex | Email subject OR REST path |
| Status | 130 | BankCommStatusBadge |
| Message ID | 220 | Sender-issued or our generated UUID |
| ⋯ | 40 | Row menu: View / Resend / Copy ID |

## DetailPane behaviors

- Selecting a row in the grid loads the right pane.
- For email: render sanitized HTML body in iframe sandbox. "View source" toggle.
- For REST: PayloadViewer; outgoing request + bank response (status, headers, body).
- For OAuth: token-issuance log; never display full token (only masked + scopes).
- "Resend" button — outbound failed only; admin role; requires reason; replays the EXACT prior payload (immutable replay).
- "Open app →" navigates to LoanDetailPage / Bank communication tab.

## Bulk actions

- **Bulk export** — selected rows → CSV of metadata (no payload bodies for security).
- **Bulk retry** — failed-outbound only; admin role; creates a confirm modal listing items.

## States

- **Empty** — illustration + "No bank communications yet."
- **Loading** — skeleton grid.
- **Failure cluster banner** — when ≥3 failed within last hour from one bank: red banner "{Bank}: 3 failures in last hour — adapter may be down. [Open partner bank settings]".
- **No row selected** — DetailPane shows hint "Select a row to view details."
- **Permission gated** — `LOAN_OFFICER` sees only their assigned banks; `ADMIN` sees all.

## Security UX rules

- API tokens, OAuth refresh tokens, full email recipient lists, and HMAC signatures are MASKED by default. Reveal action prompts re-auth (admin) and writes an `audit_log` entry.
- Email body never auto-expands; iframe sandbox to prevent any embedded script.
- "Copy ID" copies message_id only — never the body.

## i18n keys

```
admin.bankComms.title
admin.bankComms.kpi.sentToday / .pending / .failed / .avgResponse / .bounceRate
admin.bankComms.filter.bank / .channel / .status / .direction / .date / .search
admin.bankComms.col.{ts|direction|bank|channel|app|subject|status|messageId}
admin.bankComms.status.{queued|sent|delivered|responded|bounced|failed}
admin.bankComms.detail.viewSource
admin.bankComms.action.resend / .resendReason / .openApp / .copyId
admin.bankComms.bulk.export / .retry
admin.bankComms.empty / .failureCluster ("{bank}: {n} failures in last hour")
```

## Accessibility

- SplitView resizable; resizer is keyboard-accessible (focus + arrows).
- DataGrid full keyboard nav.
- BankCommStatusBadge variant always paired with icon + text.
- iframe email body has accessible name from email subject.
- Reveal-secret button announces "Will require re-authentication and audit log entry".

## Telemetry

- `admin.bankComms.viewed`, `admin.bankComms.rowSelected {messageId}`, `admin.bankComms.secretRevealed {field}`, `admin.bankComms.resent {messageId}`, `admin.bankComms.exported {count}`.
