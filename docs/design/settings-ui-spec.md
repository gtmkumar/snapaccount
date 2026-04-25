# SnapAccount Admin Settings Panel — UI Specification

> Produced by: ui-ux-agent
> Date: 2026-04-04
> Status: APPROVED

---

## Overview

The Settings panel is the **configuration hub** for all integrations, feature flags, and platform behavior. Every integration point is configurable here — zero code deployments needed to toggle or reconfigure any integration.

**Access:** Sidebar → Settings (gear icon, bottom of sidebar)

**Roles:** System Admin only (all sections), Operations Manager (limited sections — language, notification templates)

**Layout:** Two-column layout — left nav (settings categories), right content area.

```
[Settings layout]
[Left: Settings navigation — 240px fixed]
  [Section: Integrations]
    [Payment Gateway]
    [WhatsApp Business API]
    [AI Model Configuration]
    [Partner Banks]
    [Tally Integration]
    [Notification Channels]
  [Section: Platform]
    [Language Settings]
    [Subscription Tiers] — links to Screen 91
    [Feature Flags]
  [Section: Security]
    [Session & Auth]
    [Rate Limits]

[Right: Content area — scrollable per section]
[Save indicator: "Unsaved changes" banner at top when modified]
[Sticky footer: Save/Cancel buttons always visible]
```

---

## 1. Payment Gateway Settings

**URL:** `/admin/settings/payment-gateway`

**Purpose:** Configure Razorpay credentials and mode for subscription billing.

**Layout:**
```
[Section header: "Payment Gateway" | Badge: "Razorpay" | StatusBadge: "Active / Inactive"]

[Current status card]
  [Mode indicator: large badge]
    [Test Mode: yellow "TEST" badge]
    [Live Mode: green "LIVE" badge]
  [Connection status: "Connected" / "Not configured" / "Connection error"]
  [Last tested: timestamp]
  [SecondaryButton: "Test Connection"]

[Gateway selector — future extensibility]
  [RadioGroup: "Razorpay" (selected, only option currently)]
  [Note: "Additional gateways can be configured when required."]

[Credentials section]
  [Toggle: "Test Mode / Live Mode" — prominent, with warning on switching to Live]
    [Warning dialog on switching to Live: "You are switching to LIVE mode. Real payments will be processed."]

  [Conditional: Test Mode credentials]
    [TextInput: "Razorpay Test Key ID" — type password, masked by default]
    [TextInput: "Razorpay Test Key Secret" — type password, masked]
    [Row: [Eye icon to reveal] [Copy icon] [Clear icon] per field]

  [Conditional: Live Mode credentials (shown when Live toggled)]
    [TextInput: "Razorpay Live Key ID" — type password, masked]
    [TextInput: "Razorpay Live Key Secret" — type password, masked]
    [Warning banner: "Never share or commit these credentials to version control."]

[Webhook Configuration]
  [Display (readonly): "Webhook URL" — the SnapAccount endpoint to configure in Razorpay dashboard]
    [URL displayed in read-only styled input with Copy button]
    [URL example: "https://api.snapaccount.in/webhooks/razorpay"]
  [TextInput: "Webhook Secret" — for request signature verification]
  [Instructions: "Configure this URL in your Razorpay Dashboard → Settings → Webhooks"]
  [Link: "Open Razorpay Dashboard" (external)]

[Supported payment methods (informational only)]
  [Checkboxes (view only): UPI ✓ | Cards ✓ | Net Banking ✓ | Wallets ✓ | EMI ✓]

[Save button: PrimaryButton "Save Payment Settings"]
[Test connection result: inline alert after test]
```

**Key Components:**
- Toggle (test/live mode), TextInput (masked credentials), AlertBanner
- PrimaryButton, SecondaryButton, readonly display (webhook URL with copy)

**Validation:**
- Key ID format: starts with `rzp_test_` or `rzp_live_` prefix
- Warn if credentials for wrong mode are entered (e.g., test key in live mode)
- Test connection: calls Razorpay API with credentials to validate before saving

---

## 2. WhatsApp Business API Settings

**URL:** `/admin/settings/whatsapp`

**Purpose:** Enable/disable WhatsApp Business messaging and configure credentials. Off by default.

**Layout:**
```
[Section header: "WhatsApp Business API"]

[Master toggle — large, prominent]
  [Toggle: "Enable WhatsApp Messaging" — OFF by default]
  [When OFF: All other fields greyed out / disabled]
  [When turning ON: Show confirmation: "This will start sending WhatsApp messages to users. Make sure your WhatsApp Business account is fully set up."]

[Status indicator (when ON)]
  [Account status: "Verified" / "Pending" / "Suspended"]
  [Phone number: "+91 XXXXXXXXXX" — display only]
  [Monthly message count: N/M messages used]

[Credentials section — disabled when toggle OFF]
  [TextInput: "WhatsApp Business Account ID (WABA ID)"]
  [TextInput: "Phone Number ID"]
  [TextInput: "Permanent Access Token" — type password, masked]
  [TextInput: "App ID"]
  [SecondaryButton: "Verify Credentials"]

[Webhook configuration]
  [Display: "Webhook URL for Meta" — readonly + copy]
  [Display: "Verify Token" — readonly + copy (auto-generated on first save)]

[Template management section]
  [Link: "Manage Message Templates" → Notification Template Manager (Screen 95)]
  [Note: "All WhatsApp messages must use pre-approved templates from Meta Business Manager."]
  [Quick stat: "N approved templates / N pending approval"]

[Message event toggles]
  [Heading: "Send WhatsApp messages for:"]
  [Toggle row: GST filing reminders]
  [Toggle row: ITR deadline reminders]
  [Toggle row: Document processing updates]
  [Toggle row: Loan status updates]
  [Toggle row: Chat message notifications]
  [Toggle row: E-verification reminders]
  [Toggle row: Subscription renewal reminders]
  [Toggle row: Support callbacks]

[Opt-out management]
  [Note: "Users who reply STOP are automatically unsubscribed — TRAI compliance."]
  [Count: "N users have opted out of WhatsApp messages"]

[Save button: PrimaryButton "Save WhatsApp Settings"]
```

**Key Components:**
- Toggle (master + per event), TextInput (masked), AlertBanner
- SecondaryButton (verify), StatusBadge, readonly displays

---

## 3. AI Model Configuration

**URL:** `/admin/settings/ai-model`

**Purpose:** Configure the AI provider, model, and parameters. Swappable without code changes.

**Layout:**
```
[Section header: "AI Model Configuration"]

[AI Provider selection]
  [RadioGroup: "Select AI Provider"]
  [Radio: "Google Vertex AI / Gemini" — selected by default]
    [Badge: "Default" | "Recommended"]
  [Radio: "OpenAI" — future]
  [Radio: "Azure OpenAI" — future]
  [Radio: "Anthropic Claude" — future]
  [Note: "Changing provider will affect all AI features: chatbot, tax recommendations, cash flow forecasting."]

[Provider-specific settings: Vertex AI / Gemini (shown when selected)]
  [TextInput: "Google Cloud Project ID"]
  [TextInput: "Vertex AI API Key" — type password, masked]
  [Select: "Region" — default: asia-south1 (Mumbai)]
  [SecondaryButton: "Test Connection"]

[Model Configuration]
  [Select: "Model Name"]
    [Options: gemini-1.5-pro | gemini-1.5-flash | gemini-2.0-flash | gemini-2.0-pro]
    [Hint text per option: cost tier and capability summary]
  [Slider: "Temperature" — 0.0 to 1.0, step 0.1, default 0.3]
    [Below slider: "Low (0.0–0.3) = More consistent | High (0.7–1.0) = More creative"]
    [Recommended: 0.3 for tax/financial queries]
  [NumberInput: "Max tokens per response" — default 2048, range 512–8192]
  [Select: "Response language" — follows user language preference / Admin override]

[Feature-specific model overrides]
  [Accordion: Advanced — expand for per-feature model settings]
  [Row: AI Chatbot (first response) | Model selector | Temperature]
  [Row: Tax Regime Recommendation | Model selector | Temperature]
  [Row: Cash Flow Forecasting | Model selector | Temperature]
  [Row: Document Classification | Model selector | Temperature]
  [Row: Smart ITR Checklist | Model selector | Temperature]

[Sarvam AI (Indian Language NLP)]
  [Toggle: "Enable Sarvam AI for Indian language support" — ON by default]
  [TextInput: "Sarvam AI API Key" — masked]
  [SecondaryButton: "Test Sarvam AI Connection"]
  [Enabled languages for Sarvam AI: MultiSelect]
    [Options: Hindi | Bengali | Gujarati | Tamil | Telugu | Kannada | Marathi | Malayalam | Punjabi | Odia]

[RAG Pipeline settings]
  [Toggle: "Enable RAG for expert chat" — ON by default]
  [TextInput: "pgvector embedding dimensions" — default 768, readonly for Gemini]
  [NumberInput: "Top-K results for similarity search" — default 5, range 1–20]

[Usage monitoring (informational)]
  [MetricCard: AI API calls this month — count]
  [MetricCard: Estimated cost this month — AmountDisplay (USD)]
  [MetricCard: Avg response time]

[Save: PrimaryButton "Save AI Configuration"]
[Test: SecondaryButton "Test with sample query"]
```

**Key Components:**
- RadioGroup (provider), Select (model), Slider (temperature), Toggle, TextInput (masked)
- Accordion (advanced), MetricCard (usage), PrimaryButton, SecondaryButton

---

## 4. Language Settings

**URL:** `/admin/settings/language`

**Purpose:** Configure default and available languages for the platform.

**Roles:** System Admin, Operations Manager

**Layout:**
```
[Section header: "Language & Localization"]

[Default language]
  [Select: "Platform default language" — affects new users + unset preferences]
  [Options: English (default) | Hindi | Bengali | Gujarati | Tamil | Telugu | Kannada | Marathi | Malayalam | Punjabi | Odia]

[Enabled languages — admin controls which are available to users]
  [Heading: "Languages available to users"]
  [Checkbox list:]
  [✓ English (cannot uncheck — always enabled)]
  [✓ Hindi]
  [✓ Bengali]
  [□ Gujarati — off by default, check to enable]
  [□ Tamil]
  [□ Telugu]
  [□ Kannada]
  [□ Marathi]
  [□ Malayalam]
  [□ Punjabi]
  [□ Odia]

[Note: "Sarvam AI supports all Indian state languages listed above. Enable languages only when corresponding UI translations and Sarvam AI keys are configured."]

[Translation completeness status]
  [Table: Language | UI Translations % | Notification Templates | Status]
  [Row: English | 100% | All channels | Active]
  [Row: Hindi | 85% | Push + SMS | Active]
  [Row: Bengali | 60% | Push only | Partial]
  [...other languages with status]

[Admin interface language]
  [Select: "Admin panel language" — English only currently, note: "Multi-language admin panel in roadmap"]

[Date/Time format]
  [Display: "Date format: DD/MM/YYYY (Indian standard — non-configurable)"]
  [Display: "Time zone: IST (UTC+5:30) — non-configurable, DPDP data localization requirement"]
  [Display: "Currency: INR ₹ — non-configurable"]

[Save: PrimaryButton "Save Language Settings"]
```

---

## 5. Partner Bank Configuration

**URL:** `/admin/settings/partner-banks`

**Purpose:** Add, configure, and manage partner bank integrations for loan applications. Adapter pattern — any bank added without code changes.

**Layout:**
```
[Section header: "Partner Banks" | PrimaryButton: "Add Partner Bank"]

[Active banks list]
  [BankCard per bank]
    [Bank logo (upload) + Bank name + Adapter type badge]
    [Status: Active (green) / Inactive (grey) / Error (red)]
    [Connected: Yes/No | Loan types enabled: chips]
    [Actions: "Edit" | "Test Connection" | "Disable" | "Delete"]

[Add / Edit bank — modal or expanded panel]

  [Section: Bank Identity]
    [TextInput: "Bank Name (display name for users)"]
    [FileUpload: "Bank Logo" — 200x80px recommended, PNG/SVG]
    [Select: "Bank Type" — Public Sector / Private / NBFC / Small Finance Bank / Cooperative]
    [Toggle: "Active" — visible to users for loan applications]

  [Section: API Integration]
    [Select: "Adapter Type" — determines which API protocol to use]
      [Options: REST JSON (Standard) | REST XML | SOAP | Custom Webhook | Manual Review]
    [Note: "Select 'Manual Review' if bank processes applications outside the system."]

    [TextInput: "API Base URL" — e.g., https://api.bankname.com/loans/v1]
    [Select: "API Version"]
    [Select: "Authentication Type" — API Key / OAuth 2.0 / Basic Auth / Certificate]

    [Conditional fields based on Auth Type:]
    [API Key:]
      [TextInput: "API Key" — masked]
      [TextInput: "API Key Header Name" — e.g., X-API-Key]
    [OAuth 2.0:]
      [TextInput: "Client ID"]
      [TextInput: "Client Secret" — masked]
      [TextInput: "Token URL"]
      [TextInput: "Scope"]
    [Basic Auth:]
      [TextInput: "Username"]
      [TextInput: "Password" — masked]
    [Certificate:]
      [FileUpload: "Client Certificate (.pem)"]
      [TextInput: "Certificate Password" — masked]

  [Section: Loan Configuration]
    [MultiSelect: "Loan Types supported by this bank"]
      [Options: Business Loan / Working Capital / Personal Loan / MSME-Mudra]
    [TextInput: "Min loan amount (₹)"]
    [TextInput: "Max loan amount (₹)"]
    [TextInput: "Min interest rate (indicative, % p.a.)"]
    [TextInput: "Max interest rate (indicative, % p.a.)"]
    [TextInput: "Processing fee description" — shown to users]
    [TextInput: "Avg decision time" — e.g., "3-5 business days"]

  [Section: Webhook / Callback]
    [Display: "SnapAccount webhook URL for this bank" — readonly, copy button]
    [Note: "Configure this URL in the bank's portal for status update callbacks."]
    [TextInput: "Expected callback authentication header name"]
    [TextInput: "Expected callback authentication header value" — masked]

  [Section: Document Requirements]
    [Checklist of documents this bank accepts — checkboxes per document type]
    [GSTR-3B / Balance Sheet / P&L / Bank Statement / KYC / Udyam Registration / Other]

  [Test Connection: SecondaryButton "Test Bank API"]

  [Save / Cancel buttons]

[Adapter development guide note]
  [Info banner: "Each bank uses the IPartnerBankAdapter interface. Contact the backend team to implement a new adapter for banks with non-standard APIs."]
```

**Key Components:**
- Card (bank list), Form (bank editor), Select (adapter type, auth type)
- TextInput (masked credentials), Toggle, FileUpload, MultiSelect
- PrimaryButton, SecondaryButton

---

## 6. Tally Integration Settings

**URL:** `/admin/settings/tally`

**Purpose:** Configure Tally XML export feature — enabled via feature flag.

**Layout:**
```
[Section header: "Tally Integration"]

[Master toggle — large]
  [Toggle: "Enable Tally Export" — OFF by default]
  [Description: "Allow users to export financial data in Tally-compatible XML format."]
  [When ON: export options appear in user-facing Reports section]

[Export configuration — disabled when toggle OFF]
  [Select: "Tally Export Format Version"]
    [Options: Tally ERP 9 (XML) | Tally Prime (XML) | Both]
  [Select: "Default Journal Format" — Single entry / Double entry]
  [Toggle: "Include GST data in Tally XML"]
  [Toggle: "Include opening balances"]
  [Select: "Default company name in Tally export" — From business profile / Manual override]

[Export file naming]
  [TextInput: "File name prefix" — default: "SnapAccount_Tally_Export"]
  [Select: "Date format in filename" — YYYYMMDD / DD-MM-YYYY]

[Save: PrimaryButton "Save Tally Settings"]
```

---

## 7. Subscription Tier Configuration

**URL:** `/admin/settings/subscriptions`

**Purpose:** Note — detailed tier config covered in Screen 91 (Plan Configuration). This settings entry is a shortcut link.

**Layout:**
```
[Section header: "Subscription Plans"]
[Info: "Manage subscription tiers, pricing, and feature limits"]
[PrimaryButton: "Go to Plan Configuration" → links to Screen 91]

[Quick summary: current plans count, active subscribers, MRR]
```

---

## 8. Notification Channel Settings

**URL:** `/admin/settings/notifications`

**Purpose:** Enable/disable and configure credentials for each notification channel.

**Layout:**
```
[Section header: "Notification Channels"]

[Channel cards — one per channel]

[Channel: Push Notifications (FCM)]
  [Toggle: "Enable Push Notifications" — ON by default]
  [Status: "Firebase project connected" or "Not configured"]
  [TextInput: "Firebase Project ID"]
  [TextInput: "Firebase Service Account JSON" — paste JSON or file upload]
  [Note: "Configure in Firebase Console → Project Settings → Service Accounts"]
  [SecondaryButton: "Test — Send test push to my device"]

[Channel: SMS (MSG91)]
  [Toggle: "Enable SMS Notifications" — ON by default]
  [TextInput: "MSG91 API Key" — masked]
  [TextInput: "MSG91 Sender ID" — 6-character DLT registered sender ID]
  [TextInput: "MSG91 Auth Key"]
  [Note: "DLT registration required for commercial SMS in India. Ensure templates are registered."]
  [SecondaryButton: "Test — Send test SMS to my number"]

[Channel: Email (SendGrid)]
  [Toggle: "Enable Email Notifications" — ON by default]
  [TextInput: "SendGrid API Key" — masked]
  [TextInput: "From Email Address" — e.g., noreply@snapaccount.in]
  [TextInput: "From Display Name" — e.g., SnapAccount]
  [Toggle: "Use custom domain for email links" — for unsubscribe / tracking]
  [SecondaryButton: "Test — Send test email"]

[Channel: WhatsApp Business API]
  [Info: "WhatsApp is configured in the dedicated WhatsApp section."]
  [Link: "Go to WhatsApp Settings"]

[Channel: In-App Notifications]
  [Toggle: "Enable in-app notification center" — ON, cannot turn off]
  [Note: "In-app notifications are always enabled and cannot be disabled."]

[Notification defaults]
  [Select: "Default priority for critical notifications" — High (bypass DND)]
  [Select: "Quiet hours" — Don't send push between: From/To time selector]
  [Toggle: "Respect user notification preferences" — ON by default (recommended)]

[Save: PrimaryButton "Save Notification Settings"]
```

---

## 9. Feature Flags

**URL:** `/admin/settings/feature-flags`

**Purpose:** Master list of all toggleable features — runtime feature control without deployment.

**Layout:**
```
[Section header: "Feature Flags"]
[Warning banner: "Feature flag changes take effect immediately for all users. Test in staging before enabling in production."]

[Search: TextInput "Search feature flags..."]
[Filter: Select "Category" — All / Integrations / AI / Compliance / User Features / Admin Features / Experimental]

[Feature flags table]
  [Columns: Feature Name | Description | Category | Enabled | Last Changed By | Last Changed At | Actions]
  [Toggle per row: ON/OFF]
  [Actions: "View usage" | "History"]

[Complete feature flag list:]

Category: Integrations
| Flag | Description | Default |
|------|-------------|---------|
| `whatsapp_messaging` | Enable WhatsApp Business API messaging | OFF |
| `tally_export` | Enable Tally XML export for users | OFF |
| `google_meet_integration` | Enable Google Meet for video consultations | ON |
| `zoom_integration` | Enable Zoom as alternative for video calls | OFF |
| `razorpay_payments` | Enable Razorpay subscription billing | ON |
| `partner_bank_api_submission` | Enable automated submission to partner bank APIs | ON |
| `sarvam_ai_languages` | Enable Sarvam AI for Indian language support | ON |

Category: AI Features
| Flag | Description | Default |
|------|-------------|---------|
| `ai_chatbot_first_response` | AI chatbot responds before routing to CA | ON |
| `ai_tax_regime_recommendation` | AI recommends Old vs New regime | ON |
| `ai_cash_flow_forecasting` | AI-powered cash flow predictions | ON |
| `ai_smart_itr_checklist` | AI personalizes ITR document checklist | ON |
| `ai_document_classification` | AI auto-categorizes uploaded documents | ON |
| `ai_anomaly_detection` | Flag unusual transactions / filing discrepancies | OFF (experimental) |
| `ai_ocr_feedback_loop` | Operators can flag OCR errors for model improvement | ON |

Category: Compliance
| Flag | Description | Default |
|------|-------------|---------|
| `e_invoicing` | Enable e-invoicing (IRN generation) for eligible businesses | ON |
| `e_way_bill` | Enable e-way bill generation | ON |
| `gstr_2a_2b_reconciliation` | Enable auto ITC reconciliation with GSTR-2A/2B | ON |
| `gstr_9_annual_return` | Enable GSTR-9 annual return module | ON |
| `tds_under_gst` | Enable TDS deduction under GST section | OFF |
| `tds_management_module` | Enable full TDS management (24Q, 26Q, 27Q) | OFF |
| `itr_e_verification` | Enable e-verification via Aadhaar OTP in-app | ON |

Category: User Features
| Flag | Description | Default |
|------|-------------|---------|
| `multi_organization_support` | Users can manage multiple businesses | ON |
| `document_sharing` | Users can share documents with CA or bank | ON |
| `document_tagging` | Users can add custom tags to documents | ON |
| `bulk_document_upload` | Users can upload multiple documents at once | ON |
| `loan_comparison` | Show loan comparison screen | ON |
| `emi_calculator` | Show EMI calculator in Loan Hub | ON |
| `cash_flow_forecasting_user` | Show AI cash flow forecast to users | ON |
| `comparative_analysis_report` | Year-over-year comparison reports | ON |
| `previous_year_itr_import` | Import prior year ITR data | ON |
| `app_lock_pin` | PIN/biometric lock for the mobile app | ON |
| `report_pdf_export` | PDF export for financial reports | ON |

Category: Admin Features
| Flag | Description | Default |
|------|-------------|---------|
| `ocr_confidence_report` | Show OCR confidence analytics for admins | ON |
| `chat_analytics` | Show chat analytics dashboard | ON |
| `compliance_dashboard` | Show DPDP compliance dashboard | ON |
| `financial_year_closing` | Enable FY closing process | ON |
| `data_export_for_auditors` | Enable structured data export (Tally/CSV) | ON |

Category: Experimental (OFF by default, production-controlled)
| Flag | Description | Default |
|------|-------------|---------|
| `ai_anomaly_detection` | Vertex AI anomaly detection for transactions | OFF |
| `voice_assistant` | Voice input for filing queries | OFF |
| `video_kyc` | Video KYC alternative to Aadhaar OTP | OFF |

[Edit flag dialog — click Actions → Edit]
  [Flag name (readonly)]
  [Description (editable)]
  [Toggle: Enabled/Disabled]
  [Rollout % — for gradual rollout: "Enable for X% of users" (0-100%)]
  [User segment — for targeted rollout: All / Pro plan only / Beta users]
  [Notes: TextArea "Reason for change" — required for audit]
  [Save — records who changed it and when in audit log]

[Save all: "Save All Flag Changes" — saves all pending toggle changes at once]
[History link: "View Feature Flag Change History" → audit log filtered to feature flag actions]
```

**Key Components:**
- Toggle (per feature flag), Table (filterable), TextInput (search)
- AlertBanner (critical warning), Select (category filter)
- Edit modal (rollout %, segment, notes)

**Audit trail:** Every feature flag change recorded in audit log with: who changed it, from/to value, reason, timestamp.

---

## Settings Page UX Notes

1. **Unsaved changes guard:** Browser `beforeunload` prompt if navigating away with unsaved changes.

2. **Save confirmation:** After saving sensitive settings (credentials), show success toast with timestamp: "Payment gateway settings saved at 10:34 AM IST by [Admin Name]".

3. **Credential masking:** All API keys and secrets displayed as `•••••••••••` by default. Click eye icon to reveal (requires admin re-authentication for high-sensitivity values like payment gateway live keys).

4. **Test before save:** Connection test buttons available for all API integrations before committing credentials.

5. **Settings audit log:** All settings changes automatically recorded in the Audit Log (Screen 99) — what was changed, by whom, when. Settings audit entries are immutable.

6. **Environment awareness:** Settings panel displays current environment badge: `DEVELOPMENT` / `STAGING` / `PRODUCTION` — prevents accidental production misconfigurations.

7. **Export/Import settings:** System Admin can export settings as JSON (for backup/migration) and import settings into a new environment. Credentials are excluded from exports.
