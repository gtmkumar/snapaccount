# Admin — PartnerBanksSettingsPage

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Admin-only registry of partner banks. CRUD over `loan.partner_banks` rows, including adapter type selection and per-adapter configuration. Wires into Phase 6F Settings shell.

## User Goal

"Onboard a new bank in five minutes. Edit credentials safely. See which banks are healthy."

---

## Layout

```
┌─ SettingsShell (Phase 6F) ───────────────────────────────┐
│  SectionTitle  "Partner banks"   [+ Add partner bank]    │
│  HelpRibbon "Banks are surfaced in LoanHub once active." │
│  ─────────────────────────────────────────────────────── │
│  HealthSummary                                             │
│   [Active 6]  [Inactive 2]  [Adapter errors today 1]     │
│  ─────────────────────────────────────────────────────── │
│  BankCardList (grid 2-up at ≥1024px, 1-up below)         │
│   ┌──────────────────────────────────────┐               │
│   │ [logo 56pt]  Bank name                │               │
│   │ AdapterTypeBadge   StatusBadge        │               │
│   │ contact@bank.example                  │               │
│   │ Last successful submission 25 Apr 09:02│              │
│   │ [Edit]   [Test connection]   [⋯]      │               │
│   └──────────────────────────────────────┘               │
└────────────────────────────────────────────────────────── ┘
```

---

## Add / Edit drawer

Side drawer (640pt width on desktop, full-screen on tablet).

```
DrawerHeader  "Add partner bank" / "Edit {bank}"   [X]
Body
 Section "Identity"
  TextInput "Bank name"  *
  LogoUploader (PNG/SVG, <100 KB)
  TextInput "Display description"
 Section "Adapter"
  RadioGroup "Adapter type"  *
   [ Email (SendGrid)]   [ REST (basic)]   [ OAuth2 (REST)]
  --- conditional fields based on type below ---
  EMAIL:
   EmailInput "Recipient email"  *
   EmailInput "CC (optional)"
   TextInput "Reply-to address"
  REST:
   UrlInput "Submission endpoint"  *
   Select "Method"  default POST
   KeyValueEditor "Static headers"
   SecretInput "API key"   (masked, write-only)
  OAUTH2:
   UrlInput "Token URL"
   TextInput "Client ID"
   SecretInput "Client secret"  (masked, write-only)
   TextInput "Scopes"
   UrlInput "Submission endpoint"  *
 Section "Loan products on this bank"
  ProductChipsEditor (add/edit products: name, min/max, tenure, rate range)
 Section "Status"
  Toggle "Active"     (off = hidden from LoanHub)
DrawerFooter
 [Test connection]                       [Cancel] [Save]
```

---

## Components used

- `SettingsShell` (Phase 6F).
- `BankAdapterTypeBadge` — variants `email`, `rest`, `oauth`.
- `BankHealthBadge` — `healthy` (success), `degraded` (warning), `down` (error), `inactive` (neutral).
- `Drawer` (existing).
- `RadioGroup`, `KeyValueEditor`, `SecretInput` (Phase 6E secrets primitive — write-only display; never echo back saved value).
- `ProductChipsEditor` — list + add modal for `loan_products`.
- `LogoUploader` — client-side resize to 256px square; validates filetype/size.

## "Test connection" action

- Email: sends a test email "SnapAccount adapter test for {bankName}" to recipient; resolves once SendGrid 202; surfaces message ID.
- REST: sends a `GET /healthz` (or configurable health path) with auth headers; expects 2xx within 10s.
- OAuth2: calls token endpoint with client credentials; expects valid `access_token`; never logs token.
- Result inline in drawer footer: green "OK · {ms} ms" or red "Failed: {error code}".

## Secrets handling

- `SecretInput` shows **last 4 chars** of saved secret + "Replace" button. Saving requires re-typing the full secret.
- On save, secret is sent over TLS to backend → Secret Manager. The page never displays full secret value.
- Audit log entry on every secret create/update with admin user ID.

## States

- **Loading** — skeleton 4 cards.
- **Empty** — illustration "No banks yet" + Add CTA.
- **Saving** — drawer footer disabled + spinner.
- **Save failed (validation)** — inline field errors.
- **Save failed (server)** — toast w/ error code; drawer remains open.
- **Test failed** — red row in footer; user may save anyway with explicit confirm.
- **Read-only role** — non-admin sees cards but Add/Edit/Test buttons hidden.

## Role gating

- Visible only to `ADMIN`.
- Audit log on every create/update/delete with diff (with secret values redacted).

## Validation

- Bank name unique per org.
- Email recipient: RFC 5322.
- REST URL: HTTPS only (no http://).
- OAuth scopes: comma-separated; none required.
- At least one loan product before bank can be Active.

## i18n keys

```
admin.partnerBanks.title / .add / .help
admin.partnerBanks.health.active / .inactive / .errorsToday
admin.partnerBanks.card.lastSubmission / .testConnection
admin.partnerBanks.drawer.title.add / .title.edit
admin.partnerBanks.drawer.section.identity / .adapter / .products / .status
admin.partnerBanks.adapter.type ("Adapter type")
admin.partnerBanks.adapter.email / .rest / .oauth
admin.partnerBanks.field.recipientEmail / .cc / .replyTo
admin.partnerBanks.field.endpoint / .method / .headers / .apiKey
admin.partnerBanks.field.tokenUrl / .clientId / .clientSecret / .scopes
admin.partnerBanks.toggle.active / .inactive
admin.partnerBanks.test.ok ("OK · {ms} ms") / .test.fail ("Failed: {code}")
admin.partnerBanks.save / .cancel
admin.partnerBanks.error.urlMustBeHttps / .duplicateName / .productsRequired
```

## Accessibility

- Drawer traps focus; ESC dismisses; restore focus on close.
- RadioGroup: WAI-ARIA radiogroup with `aria-label` "Adapter type".
- SecretInput: `aria-describedby` hint "Secret stored securely. Last 4 chars shown."
- LogoUploader: file picker + drag-zone; alt-text required field for logo.
- Color cues for health badges paired with icon + text.
- Touch targets 44×44pt.

## Telemetry

- `admin.partnerBanks.viewed`, `admin.partnerBanks.created {bankId, adapterType}`, `admin.partnerBanks.updated`, `admin.partnerBanks.testConnection {result, ms}`, `admin.partnerBanks.activated / .deactivated`.

## Settings wiring (Phase 6F)

- This page is registered in `Settings → Integrations → Partner banks`.
- The route is `/admin/settings/partner-banks`.
- Permission: `loans.banks.manage`.
