# Mobile Screens: Loan Hub (Screens 25–32)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 25: Loan Types Selection

**Purpose:** Entry point for loan application — browse available loan types.

**Layout:**
```
[TopNavBar: Back, "Loan Hub" large title]
---
[Hero card: gradient brand-500→brand-700]
  [Heading: "Get the right loan for your business"]
  [Subtext: "Powered by GST data + AI — no paperwork"]
  [AmountDisplay: "Up to ₹50L available based on your profile"]

[Loan type cards — vertical list, large touch targets]

[LoanCard: Business Loan]
  [Icon: briefcase, brand-colored]
  [Label: "Business Loan"]
  [Range: "₹1L – ₹50L"]
  [Features: "Growth capital, expansion, inventory"]
  [Interest indicator: "From 12% p.a." text-sm]
  [PrimaryButton: "Check Eligibility"]

[LoanCard: Working Capital]
  [Icon: arrows-cycle, success-colored]
  [Label: "Working Capital Loan"]
  [Range: "₹50K – ₹25L"]
  [Features: "Cash flow, day-to-day operations"]
  [Interest indicator: "From 14% p.a." text-sm]

[LoanCard: Personal Loan]
  [Icon: user, accent-colored]
  [Label: "Personal Loan"]
  [Range: "₹50K – ₹10L"]
  [Features: "Personal needs, emergency"]

[LoanCard: MSME/Mudra]
  [Icon: india-flag-subtle, success-colored]
  [Label: "MSME / Mudra Loan"]
  [Range: "₹10K – ₹10L"]
  [Features: "Government-backed, lower interest"]
  [Badge: "Govt. Scheme" — success badge]

[Bottom section]
  [GhostButton: "EMI Calculator" — with calculator icon]
  [GhostButton: "Compare Loan Offers" — with compare icon]
```

**Key Components:**
- Card (loan type), MetricCard (hero), Badge, PrimaryButton, GhostButton
- AmountDisplay

**Navigation:**
- Arrives: BottomTabBar → More → Loan Hub, or Home screen loan prompt
- Exits to:
  - "Check Eligibility" → Eligibility Check Screen (with loan type pre-selected)
  - "EMI Calculator" → EMI Calculator Screen
  - "Compare Loan Offers" → Loan Comparison Screen

**Key Interactions:**
- Tap loan card (anywhere except button): Expand to show more details about loan type
- Loan cards refresh interest rates from API

**Indian UX notes:**
- Mudra loan is government-backed — highlight as preferred option for micro-businesses
- Interest rates shown as indicative — disclaimer: "Rates vary by bank and profile"
- MSME registration number (Udyam) field may be pre-filled from profile

---

## Screen 26: Eligibility Check Screen

**Purpose:** Assess if user qualifies for selected loan type based on business health data.

**Layout:**
```
[TopNavBar: Back, "Check Eligibility" title]
[Loan type selected shown as small badge at top]
---
[Section: "Your Business Profile"]
  [Auto-populated from system — read-only display]
  [Row: Business Vintage — X years]
  [Row: Annual Turnover (estimated from GST data) — AmountDisplay]
  [Row: GST Compliance Score — ProgressBar 0-100% with label]
  [Row: Average Bank Balance — "Link bank statement to show"]
  [Row: Existing Loans — count + total outstanding]

[Section: "Eligibility Inputs — fill to improve assessment"]
  [TextInput: "Desired Loan Amount" — INR input]
  [Select: "Loan Purpose" — Inventory / Equipment / Expansion / Working Capital / Other]
  [TextInput: "Monthly Revenue (approx)" — if not from GST data]
  [Toggle: "Any existing loans?" — shows details if yes]

[PrimaryButton: "Check Eligibility"]

--- After check ---

[Eligibility result card]
  [Pre-approved illustration if eligible — green checkmark animation]
  [Heading: "You're Eligible!" text-xl font-bold text-success-600]
  [Estimated offer: "₹10L – ₹20L at 13-16% p.a."]
  [Partnered banks count: "3 banks available"]
  [PrimaryButton: "Start Application"]

  OR

  [Partially eligible:]
  [Heading: "Partially Eligible" text-xl font-bold text-warning-600]
  [What's needed: checklist of missing factors]
  [GhostButton: "How to improve eligibility?"]

  OR

  [Not eligible:]
  [Heading: "Not Eligible Yet"]
  [Reasons with improvement tips]
  [GhostButton: "Learn how to improve"]
```

**Key Components:**
- ProgressBar (compliance score), AmountDisplay, Toggle
- AlertBanner, PrimaryButton, GhostButton, MetricCard

**Navigation:**
- Arrives: Loan Types Selection
- Exits to: Document Package Preview (if eligible → Start Application)

**Indian UX notes:**
- GST compliance score is key for Indian SME loans — surface prominently
- Business vintage (years in operation) is a major lender criteria
- Mudra loans have lower eligibility requirements — surface this if main check fails

---

## Screen 27: Document Package Preview

**Purpose:** Preview the auto-generated document package before submitting to bank.

**Layout:**
```
[TopNavBar: Back, "Document Package" title, Info icon]
---
[Info banner: "Auto-generated from your SnapAccount data. All documents are watermarked."]

[Package summary card]
  [PackageName: "Loan Application Package — Business Loan ₹15L"]
  [Documents count: "12 documents, 48 pages"]
  [Generated: today's date + time]

[Document checklist — each as card]
  [Document item row]
  [Green check: "12-Month GSTR-3B Summaries" — auto-generated]
  [Green check: "Balance Sheet (FY 2024-25)" — from accounting]
  [Green check: "P&L Statement (FY 2024-25)" — from accounting]
  [Green check: "Bank Statement (last 6 months)" — uploaded document]
  [Green check: "KYC — PAN, Aadhaar" — from profile]
  [Yellow warning: "Business address proof" — not uploaded yet]
  [Red X: "Last 2 years ITR" — required, not available]

[Missing documents alert]
  [Warning banner: "2 documents missing. Add them to strengthen your application."]
  [PrimaryButton: "Upload Missing Documents" small]

[Watermark note]
  [Info: "All documents will be watermarked 'FOR BANK USE ONLY — [Applicant Name]'"]

[Bottom actions]
  [SecondaryButton: "Preview Package PDF"]
  [PrimaryButton: "Proceed to Application"]
```

**Key Components:**
- Card, Checkbox (status only, not interactive), AlertBanner
- StatusBadge, PrimaryButton, SecondaryButton

**Navigation:**
- Arrives: Eligibility Check → Start Application
- Exits to:
  - "Upload Missing Documents" → Document Vault
  - "Preview Package PDF" → PDF Preview Screen
  - "Proceed to Application" → Loan Application Form

---

## Screen 28: Loan Application Form

**Purpose:** Collect remaining application information not already in the system.

**Layout:**
```
[TopNavBar: Back, "Loan Application" title, "Step 1 of 2" right]
[ProgressBar: 50%]
---
[Section: "Loan Details (pre-filled from eligibility)"]
  [Select: "Loan Type" — locked to selected type]
  [TextInput: "Loan Amount Requested" — editable]
  [Select: "Loan Tenure" — 12/24/36/48/60 months]
  [Select: "Purpose of Loan" — detailed dropdown]

[Section: "Business Details (verify & complete)"]
  [TextInput: "Business Name" — from profile]
  [TextInput: "GSTIN" — from profile]
  [TextInput: "Annual Turnover" — editable estimate]
  [TextInput: "Udyam Registration Number" — optional MSME reg]

[Section: "Bank Selection"]
  [Heading: "Choose Partner Banks"]
  [Subtext: "Applications sent to selected banks. All banks see the same data."]
  [Bank selection list — checkboxes]
  [BankCard per partner bank]
  [BankCard: Bank logo + name + estimated range + estimated rate]
  [Checkbox to select]

[Step 2 of 2: Personal/Guarantor Details]
  [Director/Proprietor name, PAN, address]
  [Co-applicant details if applicable]

[PrimaryButton: "Review Application" → goes to Consent Screen]
```

**Key Components:**
- TextInput, Select, Checkbox (bank selection), Card (bank card)
- ProgressBar, PrimaryButton

**Navigation:**
- Arrives: Document Package Preview
- Exits to: Consent Screen

---

## Screen 29: Consent Screen

**Purpose:** Collect explicit, informed consent for sharing financial data with partner banks.

**Layout:**
```
[TopNavBar: Back, "Your Consent" title]
---
[Illustration: Secure lock with handshake]

[Heading: "Data Sharing Consent" text-xl font-bold]

[Consent card — bordered, slightly elevated]
  [List of what will be shared:]
  [• Business name, PAN, GSTIN]
  [• 12-month GST filing history]
  [• Financial statements (P&L, Balance Sheet)]
  [• Bank statements uploaded to SnapAccount]
  [• KYC documents]

  [List of banks receiving data:]
  [• [Bank 1 name]]
  [• [Bank 2 name]]

  [Consent duration: "This consent is valid until your application is processed or 90 days, whichever is earlier."]
  [Revocability: "You can revoke this consent anytime from your Profile > Loan Applications."]

[Checkboxes — all required]
  [Checkbox: "I have read and understood what data will be shared"]
  [Checkbox: "I consent to SnapAccount sharing this data with the selected banks"]
  [Checkbox: "I confirm all information provided is accurate to my knowledge"]

[Metadata auto-captured and displayed]
  [Info banner: "Your consent will be recorded with timestamp: [datetime], IP: [masked IP], Device: [device ID partial]" — DPDP Act compliance]

[PrimaryButton: "Give Consent & Submit Application" — enabled only when all 3 checkboxes ticked]
[GhostButton: "Cancel" — returns to application form]
```

**Key Components:**
- Checkbox (x3), Card, AlertBanner, PrimaryButton, GhostButton

**Navigation:**
- Arrives: Loan Application Form
- Exits to: Loan Status Tracking (after successful submission)

**Indian UX / Legal notes:**
- DPDP Act 2023 + RBI digital lending guidelines require explicit, granular consent
- Timestamp + IP + device recorded for audit
- Consent must be revocable — show revocation path
- Plain language — no legal jargon

---

## Screen 30: Loan Status Tracking

**Purpose:** Track active loan application status across multiple banks.

**Layout:**
```
[TopNavBar: Back, "Loan Applications" title]
---
[Active applications list]

[ApplicationCard per application]
  [Loan type + requested amount]
  [Banks applied to: avatar row of bank logos]
  [StatusBadge: e.g. UNDER_REVIEW]
  [StatusTimeline: horizontal — Initiated → Docs Ready → Submitted → Under Review → Decision]
  [Current step highlighted with pulsing indicator]
  [Last updated: relative timestamp "2 hours ago"]
  [PrimaryButton: "View Details" — expands or navigates]

[Per-bank status breakdown]
  [Bank 1: UNDER_REVIEW — "Expected decision in 3-5 days"]
  [Bank 2: ADDITIONAL_DOCS_NEEDED — orange — "Upload requested docs"]
  [Bank 3: APPROVED ✓ — green — "Offer: ₹15L at 13.5% p.a."]

[Approved offer action]
  [Success banner: "Offer from [Bank Name]: ₹15L at 13.5% for 36 months"]
  [EMI: "₹51,234/month"]
  [PrimaryButton: "Accept Offer"]
  [SecondaryButton: "Compare with other offers"]

[Empty state: "No active loan applications. Start your application today."]
```

**Key Components:**
- StatusTimeline, StatusBadge, AmountDisplay, MetricCard
- Card, PrimaryButton, SecondaryButton, AlertBanner

**Navigation:**
- Arrives: Post-consent submission, or BottomTabBar More → Loans
- Exits to:
  - "Upload requested docs" → Document Vault (with pre-tagged loan category)
  - "Accept Offer" → Acceptance confirmation
  - "Compare" → Loan Comparison Screen

---

## Screen 31: EMI Calculator

**Purpose:** Calculate estimated EMI for different loan amounts, interest rates, and tenures.

**Layout:**
```
[TopNavBar: Back, "EMI Calculator" title]
---
[Input section: card]
  [Label + Slider: "Loan Amount" — ₹1L to ₹50L — with TextInput for exact value]
  [Label + Slider: "Interest Rate" — 8% to 30% p.a.]
  [Label + Slider: "Loan Tenure" — 6 to 84 months]

[Result card: elevated, brand-colored]
  [Monthly EMI: AmountDisplay large — e.g. "₹22,748/month"]
  [Total Interest: ₹X,XX,XXX]
  [Total Repayment: ₹X,XX,XXX]

[Breakdown chart: Pie or donut — Principal vs Interest split]

[Amortization table toggle]
  [GhostButton: "View Month-by-Month Schedule"]
  [Table: Month | EMI | Principal | Interest | Balance]

[Bottom]
  [PrimaryButton: "Apply for this Loan" — navigates to application with values pre-filled]
```

**Key Components:**
- Slider (custom), TextInput, AmountDisplay, Chart (pie), Card
- PrimaryButton, GhostButton, TaxBreakdownTable (amortization)

**Navigation:**
- Arrives: Loan Types Selection "EMI Calculator" button
- Exits to: Loan Application Form (with pre-filled values) or Back

**Indian UX note:** EMI in INR format. Show monthly EMI prominently — that's the key decision metric for Indian borrowers.

---

## Screen 32: Loan Comparison

**Purpose:** Compare loan offers from multiple partner banks side by side.

**Layout:**
```
[TopNavBar: Back, "Compare Loans" title]
---
[Comparison header: Bank 1 | Bank 2 | Bank 3 columns]

[Comparison rows]
[Row: Loan Amount | ₹15L | ₹12L | ₹18L]
[Row: Interest Rate | 13.5% | 15% | 12.5%]
[Row: Tenure | 36 mo | 48 mo | 36 mo]
[Row: Monthly EMI | ₹51,234 | ₹38,902 | ₹58,432]
[Row: Processing Fee | 1% | 0.5% | 2%]
[Row: Total Cost | ₹18.4L | ₹18.7L | ₹21L]
[Row: Best For | Quick disbursal | Long tenure | Highest amount]
[Row: AI Recommendation badge | ⭐ Recommended | — | —]

[Recommended banner: brand-colored]
  ["AI suggests [Bank 1] — lowest total cost for your profile"]

[Select offer buttons]
  [Per column: SecondaryButton "Select [Bank 1]"]
```

**Key Components:**
- Comparison table, AmountDisplay, Badge (AI Recommended)
- AlertBanner, SecondaryButton

**Navigation:**
- Arrives: Loan Status Tracking "Compare" or Loan Types
- Exits to: Consent Screen with selected bank pre-checked

**Indian UX note:** Show "Total cost of loan" prominently — many Indian borrowers focus only on EMI and miss total interest burden.
