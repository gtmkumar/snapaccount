# Team Page (Admin)

> Phase 6F · Track F3 · Path: `/team` · Role: ADMIN.

## 1. Purpose
Invite teammates, assign roles, view per-CA workload (callbacks, filings), and manage org-scoped team membership.

## 2. User goal
"Invite a new CA, give them GST + ITR scope, see they're handling 14 active filings already, reassign two to balance load."

## 3. Layout

Tabs (default variant):
1. **Members** — main list.
2. **Workload** — workload heatmap by user.
3. **Invites** — pending invitations.
4. **Roles & permissions** — role definitions (read-only at member view; expandable card list).

### 3.1 Members tab

#### 3.1.1 Toolbar
- Search box.
- Role filter: All · ADMIN · CA · LOAN_OFFICER · OPS.
- Status filter: Active · Suspended · Invited.
- Org filter (multi-org admins only).
- Right: `Invite teammate` primary CTA.

#### 3.1.2 DataTable (roomy)
| Column | Detail |
|---|---|
| Member | Avatar + name + email |
| Role | RoleChip (color-coded per Phase 6F role palette) |
| Scope | comma-separated module chips (GST, ITR, Loans, …) |
| Status | StatusBadge (active/suspended/invited) |
| Active workload | mini bar: callbacks + filings today |
| Joined | DD/MM/YYYY |
| Last active | time-ago |
| Actions | ⋯ menu |

Row actions: Edit role, Edit scope, Suspend, Reactivate, Reset password, Remove from org (destructive confirm).

### 3.2 Invite teammate dialog (Wide)

Form sections:
- **Basics**: name, email (validated), phone (+91, 10 digit).
- **Role**: radio cards — ADMIN / CA / LOAN_OFFICER / OPS — each with description + nav-visibility preview list.
- **Scope** (visible if role = CA or LOAN_OFFICER): module checkboxes — GST, ITR, Loans, Reports.
- **Org** (multi-org admins): combobox.
- **Custom message** (optional).
- **Permissions** (advanced): collapsible — additive permission flags (`itr.review`, `loan.disburse`, etc.) for fine-grained grants beyond role default.

Footer:
- Cancel.
- "Send invitation" primary — sends email + SMS with magic link, expires in 72h.

Empty state inside scope: "Choose at least one module".

### 3.3 Workload tab

Visual layout:
- Heatmap grid: rows = users, columns = days of last 14 days. Cell intensity = number of items handled. Click cell drills into user-day audit.
- Side panel "Top 5 most loaded" (callbacks + filings combined).
- Bar chart "Filings per CA this month".
- Bar chart "Avg time-to-first-response (chat)" — only ADMIN can see.

Role-only insights: ADMIN sees all; CA / OPS would not see this tab (gated by RoleGuard at route level).

### 3.4 Invites tab

DataTable: email · role · invited by · invited at · expires · resend / revoke actions.

Empty: `empty.team` variant + "Invite your first teammate" CTA.

### 3.5 Roles & permissions tab (read-only)

Card list — one per role with:
- Description.
- Default sidebar entries (per Role-Based Shell matrix).
- Permission flags granted by default.
- Inline link "Edit role" → opens dialog (ADMIN only). For Phase 6F, role definitions are static (modify via config); this tab only reads them.

## 4. Empty / loading / error
- No members (impossible — current admin always exists): never shown.
- No invites: `empty.team` CTA.
- Workload no data: "Workload data appears after 24 hours of activity".
- Invite send error: Toast + retry.

## 5. Validation
- Email: RFC + dedup against existing org members.
- Phone: +91 prefix + 10 digit; Indian format helper text.
- Name: min 2 / max 80 chars.
- Permission incompatibility: e.g., LOAN_OFFICER cannot have `itr.review` — surfaced as inline warning.

## 6. Accessibility
- Heatmap cells `accessibilityLabel="{{user}}, {{date}}, {{count}} items"`.
- Role cards in invite dialog `role="radio"` and `aria-checked`.
- Permission checkboxes grouped under `<fieldset><legend>`.
- Suspend / Remove confirmations require typing user's email (destructive pattern).

## 7. Responsive
- < 1024px: members table horizontally scrolls; sticky first column (Member).
- < 768px: tabs collapse to dropdown; workload heatmap virtualizes columns; bar charts stack.

## 8. i18n keys
- `team.title`, `team.tabs.{members|workload|invites|roles}`
- `team.invite.cta`, `team.invite.dialog.title`
- `team.invite.role.{admin|ca|loanOfficer|ops}.label`
- `team.invite.role.{admin|ca|loanOfficer|ops}.desc`
- `team.invite.scope.label`, `team.invite.message.label`, `team.invite.send`
- `team.member.action.{editRole|editScope|suspend|reactivate|resetPassword|remove}`
- `team.workload.heatmap.cellLabel` ("{{user}} – {{date}} – {{count}} items")
- `team.invites.empty`, `team.invites.action.{resend|revoke}`
- `team.role.scope.compatible.warning`

## 9. Telemetry
- `team.invite.sent { role, scopeCount }`
- `team.member.role_changed { from, to }`
- `team.member.suspended`
- `team.member.removed` (with reason if collected)

## 10. Components used
Tabs, DataTable (roomy), FilterBar, Combobox, Dialog (Wide + Destructive), Stepper (none — single-step invite), Drawer (member detail), RoleChip (new — uses Phase 6F role palette: Admin=indigo, CA=teal, LoanOfficer=violet, Ops=amber), StatusBadge, Heatmap (new chart primitive — see component-library §F4), BarChart, EmptyState (`empty.team`), Toast, ConfirmDialog (Destructive).
