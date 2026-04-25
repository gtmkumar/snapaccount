# Subscriptions Page (Admin)

> Phase 6F · Track F3 · Path: `/subscriptions` · Role: ADMIN.

## 1. Purpose
Manage SaaS subscriptions: active subscriptions, plan CRUD, MRR dashboard, upgrade/downgrade flow with Razorpay-wired backend.

## 2. User goal
"Watch MRR trend, edit pricing on a plan, see who's churning, upgrade a customer mid-cycle without losing a beat."

## 3. Layout — three tabs

Top tabs (Tabs component, default variant):
1. **Overview** (MRR dashboard).
2. **Subscriptions** (active subscriptions table).
3. **Plans** (plan management CRUD).

### 3.1 Overview tab

#### 3.1.1 KPI cards (top row)
- MRR (with WoW % delta DeltaPill).
- Active subscriptions count.
- New this month.
- Churn this month (count + % of base).
- ARPU.
- LTV proxy.

DeltaPill from Phase 6D (positive green, negative red, with arrow + screen-reader prefix).

#### 3.1.2 MRR trend chart
- Line chart of MRR over the last 12 months.
- Points labeled in ₹ Lakhs Indian format.
- DateRangePicker (FY-aware) above chart adjusts window.
- Hover: tooltip "{{month}} · ₹{{value}} · {{count}} subs".

#### 3.1.3 Plan distribution
- Horizontal stacked bar — one segment per plan tier — width = revenue share.
- Click segment filters the Subscriptions tab to that plan.

#### 3.1.4 Recent events
- Compact DataTable: time · org · event (subscribed / upgraded / downgraded / cancelled / payment failed) · amount delta.
- Linked to the source webhook trace (admin can copy the Razorpay event id).

### 3.2 Subscriptions tab

#### 3.2.1 Filter bar
- Status: Active · Trialing · Past-due · Cancelled · Paused.
- Plan: combobox.
- Renewal range: DateRangePicker.
- Search by org name / GSTIN / Razorpay subscription id.

#### 3.2.2 DataTable (compact)
| Column | Detail |
|---|---|
| Org | name + GSTIN chip |
| Plan | chip (plan name) |
| Status | StatusBadge |
| MRR | ₹ amount, tabular-nums |
| Started | DD/MM/YYYY |
| Renews | DD/MM/YYYY |
| CSM/Owner | avatar |
| Actions | ⋯ DropdownMenu |

Row actions: Open detail, Upgrade, Downgrade, Pause, Cancel, View invoices.

Bulk: SelectionToolbar — Send reminder · Add note · Export.

#### 3.2.3 Subscription detail drawer
Right-side Drawer (size lg = 720px). Sections:
- Header: org + status + MRR.
- KPI strip: Lifetime value · Months active · Last payment · Outstanding.
- Tabs: Plan history · Invoices · Payment methods · Audit.
- Footer actions: Upgrade · Downgrade · Pause · Cancel.

### 3.3 Plans tab

#### 3.3.1 Plan list
Cards grid (3 columns desktop, responsive). Each card:
- Plan name + visibility chip (Public / Private / Archived).
- Price headline (₹/month + ₹/year).
- Feature bullets (5 max preview, "+N more" link).
- Subscriber count.
- Actions: Edit · Duplicate · Archive · Delete (destructive confirm).

#### 3.3.2 Create / Edit plan dialog (Dialog Wide)
Sections:
- Identity: name, slug (auto), visibility.
- Pricing: monthly ₹, yearly ₹, currency (locked INR for now), trial days, setup fee.
- Limits: GB storage, # users, # filings/month — JSON-backed feature gates.
- Features: rich-text bullet list (markdown-lite).
- Razorpay product mapping: plan id (read-only after first save).
- Discount eligibility: chip group (Annual prepay 10%, Referral, etc.).

Validation errors inline; Save shows ProgressIndicator; success → Toast + close.

## 4. Upgrade / Downgrade flow

### 4.1 Trigger
Drawer footer or row action.

### 4.2 Modal (Stepper, 3 steps)
1. **Pick plan** — list plans with price diff highlighted (DeltaPill on row).
2. **Proration preview** — table showing: current period balance · credit · new charge today · next-renewal amount. Currency display tip "Indian formatting".
3. **Confirm** — DisclaimerCard "Charges initiate via Razorpay; org admin notified by email" + Confirm primary CTA.

On confirm: ProgressIndicator → success toast + drawer refreshes.

### 4.3 Failure handling
- Razorpay error code surfaced in human form ("Card declined", etc.).
- Retry CTA + "Contact support" link.

## 5. Empty / loading / error
- No plans: EmptyState "Create your first plan" → opens Create dialog.
- No subscriptions: "Subscriptions appear here once a customer signs up".
- Webhook delay: banner "Recent events lagging — last sync {{minutes}} min ago — Refresh".

## 6. Razorpay integration UX
- All amounts shown in ₹ with 2-decimal precision; tabular-nums.
- Razorpay subscription IDs shown last-4 with copy icon (full id reveals in audit drawer).
- Webhook health indicator (top-right of Subscriptions tab): green dot + "Webhooks healthy" / amber + "Latency 4 min" / red + "Failing" → click opens diag drawer.

## 7. Accessibility
- DataTable: column headers `<th scope="col">`, sortable columns indicate via `aria-sort`.
- DeltaPill includes screen-reader prefix "increased by" / "decreased by".
- Dialog focus trap, ESC closes (unless mandatory confirm).
- Charts: data table fallback below chart (toggle `View as table`).

## 8. Responsive
- < 1024px: KPI cards wrap to 2-col; chart takes full width; tables horizontally scroll with sticky first column.
- < 768px: tabs become a top dropdown; cards single-column.

## 9. i18n keys
- `subscriptions.title`, `subscriptions.tabs.{overview|subscriptions|plans}`
- `subscriptions.kpi.{mrr|active|new|churn|arpu|ltv}`
- `subscriptions.status.{active|trialing|pastDue|cancelled|paused}`
- `subscriptions.action.{upgrade|downgrade|pause|cancel|viewInvoices}`
- `plans.action.{create|edit|duplicate|archive|delete}`
- `plans.form.{name|monthly|yearly|trialDays|setupFee|limits|features}`
- `subscriptions.upgrade.step.{pick|preview|confirm}`
- `subscriptions.razorpay.webhook.{healthy|laggy|failing}`

## 10. Telemetry
- `subs.viewed { tab }`
- `plan.created`, `plan.edited`, `plan.archived`
- `sub.upgraded { fromPlan, toPlan, prorationAmount }`

## 11. Components used
Tabs, KpiStrip, DeltaPill, LineChart, StackedBar, FilterBar, DateRangePicker, Combobox, DataTable (compact), Drawer (lg), Dialog (Wide + Destructive), Stepper (numbered), DisclaimerCard, StatusBadge, DropdownMenu, EmptyState, Skeleton, Toast.
