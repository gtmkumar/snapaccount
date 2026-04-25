# Admin — LoanDetailPage

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Single-application deep-dive. Loan officer / CA / admin sees the full application, manages bank assignment, monitors documents, audits consents, walks the timeline, reviews bank communications, and records disbursement.

## User Goal

"Give me one screen with everything about this app — and let me act from here without copy-pasting between tools."

---

## Layout

```
┌─ Breadcrumb  Loans / {App ID} ───────────────────────────┐
│  HeaderBlock                                              │
│   Org name · PAN · GSTIN          [Open in CRM →]        │
│   StatusBadge   "{status}"                               │
│   [Reassign bank ▾] [Mark stage ▾] [Close…]              │
│  ─────────────────────────────────────────────────────── │
│  SummaryStrip                                             │
│   ₹15,00,000 · 24 months · Working capital · Bank · Ref  │
│  ─────────────────────────────────────────────────────── │
│  Tabs:                                                    │
│   [Application] [Documents] [Consents] [Timeline]         │
│   [Bank communication] [Disbursement]                     │
└────────────────────────────────────────────────────────── ┘
```

---

## Tab 1 — Application

```
TwoColumnLayout
 Left:
  Section "Applicant"
   Org, PAN, GSTIN, Phone, Email
   Business vintage, Annual revenue (FY 24-25)
  Section "Loan parameters"
   Amount, Tenure, Purpose, Purpose note
  Section "Eligibility snapshot at submit"
   Score, qualified banks, qualifying reasons (read-only)
 Right:
  Section "Bank assignment"
   Current bank logo + name + AdapterTypeBadge
   Adapter config preview (REST endpoint masked / Email recipient)
   [Reassign bank →]   (modal)
  Section "Owner"
   Officer avatar + name + reassign menu
```

## Tab 2 — Documents

DataGrid of `application_documents`:

| Doc | Type | Source | Pages | Status | Uploaded | Actions |

- Source = manual / auto (Accounting / GST / ITR services).
- Status = pending / processing / verified / rejected.
- Actions: View / Replace (admin only) / Mark verified.
- "Regenerate package" button at top-right; disabled until all rows verified.
- Below grid: PDF package preview pane (Phase 6C web PdfViewer reuse).
- Watermark visibility is verified server-side; UI shows ✓ "Watermark intact" or ✗ "Integrity failed".

## Tab 3 — Consents (read-only audit)

```
List of 3 ConsentAuditCard
 ConsentAuditCard
  Type "CREDIT_BUREAU"      Status [Signed]
  Version 1.4 · Signed 25 Apr 2026 10:14 IST
  Signature hash …a93f
  IP 49.207.x.x  ·  UA Expo iOS 18.2  ·  Bio: yes
  [View consent text version 1.4]   [Verify HMAC]
 (repeat for DATA_SHARE_WITH_BANK, DISBURSEMENT_MANDATE)
```

- This tab is **read-only** for all roles. Consents cannot be edited from admin.
- `Verify HMAC` button calls a backend endpoint; success → green check; mismatch → red banner "Signature does not verify — escalate to security".
- DPDP regulator-ready audit format.

## Tab 4 — Timeline

Vertical StatusTimeline (Phase 6D primitive) showing every entry from `application_status_log`:

- Each node: timestamp, actor (user / system / officer / bank), action, optional payload diff.
- Filter: "All / User actions / System / Bank events".
- Export timeline as CSV.

## Tab 5 — Bank communication

(Lighter version of standalone BankCommunicationsPage; this tab is scoped to one application.)

- List of message threads (email + REST adapter calls).
- Each row: direction (inbound / outbound), channel (email / REST), subject / endpoint, timestamp, status, message_id.
- Inline preview of email body / REST payload (masked secrets).
- "Resend" button on failed outbound — admin only, requires reason.

## Tab 6 — Disbursement

```
DisbursementCard (when status APPROVED)
 "Awaiting disbursement"   ETA copy
 [Record disbursement…]   (modal: amount, UTR, date, attached proof PDF)

DisbursementCard (when status DISBURSED)
 "Disbursed ₹14,80,000 on 28 Apr 2026"
 UTR XYZ123456
 [View proof PDF]   [Download]
 Net of charges: principal vs disbursed delta breakdown.
```

- Webhook receiver auto-fills this when bank confirms (Phase 6C scope §backend §4).
- Manual record allowed for Email-adapter banks where webhook not set up.

## Components used

- `Tabs` (admin shell).
- `StatusBadge`, `BankAdapterTypeBadge` (new).
- `PdfViewer` (Phase 6B), `EditableDataGrid` (Phase 6B).
- `ConsentAuditCard` (new — see component-library addendum).
- `StatusTimeline` (Phase 6D).
- `Modal`, `FormField`, `FilePicker` (existing).

## States

- **Loading** — skeleton tabs + summary strip.
- **Stale** — banner "Refreshed 5m ago" with refresh button.
- **Webhook delivery failed** — sticky red banner on Disbursement tab if last webhook attempt failed.
- **Read-only mode** — for closed apps, all action buttons disabled with tooltip "Application closed".
- **Permission denied tab** — CAs not assigned to this app see Application + Documents only; other tabs hidden.

## Role gating

- Reassign bank, Mark stage, Close — `LOAN_OFFICER` + `ADMIN` only.
- Verify HMAC, Resend bank message — `ADMIN` only.
- Record disbursement — `LOAN_OFFICER` + `ADMIN`.

## i18n keys

```
admin.loanDetail.tab.application / .documents / .consents / .timeline / .bankComms / .disbursement
admin.loanDetail.section.applicant / .params / .eligibilitySnapshot / .bankAssignment / .owner
admin.loanDetail.consent.signedAt / .version / .hash / .verifyHmac / .viewText
admin.loanDetail.consent.verifyResult.ok / .fail
admin.loanDetail.disbursement.awaiting / .recordCta / .modal.amount / .modal.utr / .modal.date / .modal.proof
admin.loanDetail.disbursement.recorded ("Disbursed {amount} on {date}")
admin.loanDetail.bankComms.resend / .resendReason
admin.loanDetail.timeline.filter.all / .user / .system / .bank / .export
```

## Accessibility

- Tabs: WAI-ARIA tablist; arrow keys cycle, focus follows selection.
- ConsentAuditCard: HMAC hash announced as "signature ending {last4}" not full hash spelled-out.
- Timeline: list semantics; each entry's payload diff has skip-link to next entry.
- All modals trap focus and restore on close.
- Action buttons indicate disabled-reason via `aria-describedby`.

## Telemetry

- `admin.loanDetail.viewed {appId, tab}`, `admin.loanDetail.bankReassigned {from, to}`, `admin.loanDetail.consentHmacVerified {result}`, `admin.loanDetail.disbursementRecorded {appId}`, `admin.loanDetail.bankCommResent {messageId}`.
