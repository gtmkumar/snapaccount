# Admin — ItrFilingDetailPage

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25
> Owns: `src/admin/src/pages/ItrFilingDetailPage.tsx`.

---

## Purpose

Full audit view of a single filing — every artifact, computation history, e-verification status, and any notices. Used by CA when investigating, by senior reviewers for audit, and as the source-of-truth display when something is questioned later.

## CA Goal

"Show me everything about this filing on one page so I don't have to bounce between screens."

---

## Layout

```
┌─ AdminLayout ────────────────────────────────────────────────────────────┐
│  PageHeader                                                              │
│   [back]  Pradeep Kumar — ITR-2 — AY 2026-27                              │
│   right: StatusBadge + actions [Reassign] [Open computation panel]        │
│  ──────────────────────────────────────────────────────────────────────│
│  StatusTimeline (horizontal, 7 nodes)                                    │
│   DRAFT → UNDER_CA_REVIEW → USER_APPROVED → FILED → E_VERIFIED → REFUND  │
│   nodes color-coded by completion                                        │
│  ──────────────────────────────────────────────────────────────────────│
│  ThreeColumnLayout                                                       │
│  ┌─ Col 1: Profile ─────────┐ ┌─ Col 2: Documents ──────┐ ┌─ Col 3: Computation history ┐│
│  │ User card                │ │ Doc list                 │ │ Versioned computations       ││
│  │  PAN, DOB, contact       │ │  Form 16 (uploaded)      │ │  v1 — Engine baseline        ││
│  │  residential status      │ │  Bank statement          │ │  v2 — CA edits Apr 23         ││
│  │ EmploymentCard           │ │  Investment proofs       │ │  v3 — CA approved Apr 25      ││
│  │ DeductionsCard           │ │  ITR-V (after filing)    │ │  expand → diff viewer         ││
│  │ BankAccountCard          │ │  click → preview         │ │                              ││
│  └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────────┘│
│  ──────────────────────────────────────────────────────────────────────│
│  Section: E-verification                                                 │
│   e-verify state, method, evidence file (if uploaded)                    │
│  Section: Notices                                                        │
│   list of notices for this filing — link to admin notice detail          │
│  Section: Refund tracker                                                 │
│   mini status timeline + amount                                          │
│  Section: CA notes                                                       │
│   markdown editor — auto-saves every 30s                                 │
│  Section: Activity log                                                   │
│   chronological events: created, edited, recomputed, approved, filed, …  │
└────────────────────────────────────────────────────────────────────────│
```

---

## StatusTimeline (page-level, horizontal)

7 nodes representing the filing lifecycle. Each node:
- Completed: filled brand.500 with white check.
- Current: pulsing brand.500 ring.
- Future: outlined neutral.300.
- Failed/blocked branch: red node with warning icon.

Hover tooltip: timestamp + actor.

---

## Computation history (Col 3)

Each `ComputationVersion` card:
- Header: version number + label + actor + timestamp.
- Tap to expand → diff viewer:
  - Two-column diff (label · v(N-1) value · vN value · Δ).
  - Highlight rows that changed.
- "Restore this version" button (secondary; only on archived versions; opens computation panel pre-filled).

---

## Documents column

- Each document row: file icon + name + uploaded-by + uploaded-on.
- Click → opens fullscreen PDF/image viewer with download button.
- Section grouped by source: User uploads | Auto-generated (e.g., draft ITR XML) | Post-filing artifacts (ITR-V).

---

## E-verification section

Same data shape as the mobile EVerificationScreen but read-only here:
- Method, reference no, verified-on date.
- If user uploaded ITR-V → embed PDF viewer.
- If still pending → big amber banner "User has not e-verified yet — {n} days remaining."

---

## Notices section

- Inline mini-table of notices for this filing.
- Columns: Section | Severity | Received | Status | Action.
- Action button "Open" → admin notice detail.

---

## Refund tracker section

- Compact horizontal version of mobile timeline.
- 4 nodes only (skip first), with current state highlighted.
- Amount + ETA on the right.

---

## Activity log

Chronological list of every action on this filing. Each entry:
- Timestamp (relative + absolute on hover).
- Actor (user / CA name / system).
- Action verb in plain English ("CA Sushma reduced 80C from ₹1.5L to ₹1.2L").

Filterable by actor type and date.

---

## Header actions

- **Reassign** — opens dropdown of CAs in same workspace; reassign reason required.
- **Open computation panel** — navigates to the dual-pane CaTaxComputationPanel for this filing.
- **Download package (PDF)** — exports a full audit pack: profile + computation versions + all documents + activity log. (Useful for senior review.)

---

## States

- **Loading** — Skeleton header + 3-column skeletons.
- **Error** — Replace body with retry state.
- **Filing not found / unauthorized** — 404-ish empty state with link to verification queue.
- **Locked (status FILED+)** — Computation panel access disabled (read-only view); a banner at top explains "This filing is locked. Open a revision request to make changes."

---

## i18n keys

```
itr.filingDetail.title  ("{userName} — {form} — AY {ay}")
itr.filingDetail.action.reassign / .openComputation / .downloadPackage
itr.filingDetail.timeline.{draft|underCaReview|userApproved|filed|eVerified|refundDispatched|refundCredited}
itr.filingDetail.col.{profile|documents|computationHistory}
itr.filingDetail.profile.{pan|dob|contact|residentialStatus|bankAccount}
itr.filingDetail.docs.uploadedBy / .uploadedOn
itr.filingDetail.computation.version  ("v{n} — {label}")
itr.filingDetail.computation.restore
itr.filingDetail.section.{eVerification|notices|refund|caNotes|activityLog}
itr.filingDetail.activity.{created|edited|recomputed|approved|filed|eVerified|noticeReceived|caNoteAdded}
itr.filingDetail.lockedBanner
itr.filingDetail.notFound.heading
```

---

## Accessibility

- ThreeColumnLayout collapses gracefully at narrower widths (see Responsive).
- StatusTimeline nodes have keyboard focus + tooltip on focus.
- Activity log entries readable as semantic list with `<time>` elements.
- Diff viewer uses both color and `+ / -` text indicators.
- CA notes markdown editor reuses existing accessible editor (TipTap-based, Phase 4).

---

## Responsive

- ≥ 1280px: 3-column row.
- 1024–1280px: 2 columns (Profile + Documents) with computation history full-width below.
- < 1024px: stacked single column; admin desktop-first.
