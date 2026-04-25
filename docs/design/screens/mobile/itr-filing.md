# Mobile Screens: ITR Filing (Screens 33–41)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 33: ITR Dashboard

**Purpose:** Central hub for income tax return filing status and actions.

**Layout:**
```
[TopNavBar: "ITR Filing" large title, Help icon right]
---
[FY Selector: "FY 2024-25 (Current)" with dropdown]

[Filing deadline banner — if within 30 days]
  [Warning: "ITR filing deadline: July 31, 2025 — 45 days left"]

[Status summary card]
  [StatusBadge: current ITR status (large)]
  [StatusTimeline: full workflow]
    Draft → Pending Approval → User Approved → Filing In Progress → Filed → E-Verified → Completed
  [Current step highlighted with pulsing animation]

[Key metric cards: horizontal scroll]
  [MetricCard: "Gross Income" — AmountDisplay]
  [MetricCard: "Total Tax" — AmountDisplay, error-colored]
  [MetricCard: "Tax Paid" — AmountDisplay (TDS + advance tax)]
  [MetricCard: "Refund / Due" — large, positive=green/negative=red]

[Action card — dynamic per status]
  [DRAFT: PrimaryButton "Complete Document Checklist"]
  [PENDING: "Awaiting CA verification — usually 2-3 days"]
  [USER_APPROVED: PrimaryButton "E-Verify Your ITR"]
  [FILED: "Filed successfully. Please e-verify within 30 days."]
  [COMPLETED: "🎉 All done! Refund tracking below."]

[Previous Years section]
  [FY 2023-24 — Filed — StatusBadge]
  [FY 2022-23 — Filed — StatusBadge]
  ["Import last year's data" GhostButton]

[Empty state (new user):]
  [Illustration + "Start your ITR filing for FY 2024-25"]
  [PrimaryButton: "Start Filing"]
```

**Key Components:**
- StatusTimeline, StatusBadge, MetricCard, AmountDisplay
- AlertBanner, PrimaryButton, GhostButton

**Navigation:**
- Arrives: BottomTabBar → More → ITR, or Home screen ITR card
- Exits to:
  - "Complete Document Checklist" → Document Checklist Screen
  - "E-Verify" → E-Verification Screen
  - Refund section → Refund Tracking Timeline

---

## Screen 34: Document Checklist (Smart, Personalized)

**Purpose:** AI-generated personalized checklist of required documents based on employee profile.

**Layout:**
```
[TopNavBar: Back, "Document Checklist" title, Info icon]
---
[AI personalization banner]
  [Info: "Checklist personalized for [Name] — includes docs for multiple employers, HRA, capital gains"]

[Progress bar: "7 of 12 documents uploaded (58%)"]

[Checklist sections — by category]

[Section: Mandatory]
  [ChecklistItem: "Form 16 Part A (Employer 1)"]
    [StatusBadge: UPLOADED | GHostButton: Upload | if uploaded: filename + OCR confidence]
  [ChecklistItem: "Form 16 Part B (Employer 1)"]
  [ChecklistItem: "Form 26AS / AIS"]
    [Note: "Download from Income Tax Portal"]
    [GhostButton: "How to download?"]
  [ChecklistItem: "PAN Card" — if not already in profile]

[Section: Deductions (80C, 80D, etc.)]
  [ChecklistItem: "LIC Premium receipt (80C)" — with premium detected from last year]
  [ChecklistItem: "PPF passbook page"]
  [ChecklistItem: "Health insurance premium (80D)"]
  [ChecklistItem: "Home loan interest certificate (24b)" — shown only if applicable]
  [ChecklistItem: "NPS contribution receipt (80CCD)"]
  [ChecklistItem: "HRA rent receipts" — shown only if HRA claimed]
  [ChecklistItem: "Donation receipts (80G)" — shown only if applicable]

[Section: Capital Gains (if applicable)]
  [ChecklistItem: "Capital gains statement (equity)"]
  [ChecklistItem: "Property sale details"]

[Section: Other Income]
  [ChecklistItem: "Bank interest certificate (FD/savings)"]
  [ChecklistItem: "Rental income details"]

[Recommended action: "Upload 5 more documents for complete filing"]
[PrimaryButton: "Continue to Tax Computation" — enabled when mandatory docs uploaded]
[GhostButton: "Request a Callback" — triggers human-touch workflow]
```

**Key Components:**
- Checkbox (status indicator per item), StatusBadge, ProgressBar
- AlertBanner, PrimaryButton, GhostButton, EmptyState

**Navigation:**
- Arrives: ITR Dashboard "Complete Checklist"
- Exits to:
  - Tap checklist item → Document Upload Screen (for that item)
  - "Continue to Tax Computation" → Tax Computation Screen

**Key Interactions:**
- Tap uploaded item: Show document detail/preview
- Tap "Upload" button: Opens Camera/Gallery choice
- "How to download?" links open in-app browser to IT portal guide
- "Request Callback" triggers human-touch assignment in backend

**Indian UX notes:**
- Form 16 is the most critical document — highlight it prominently
- Many Indian users confuse Form 26AS (tax credit statement) with Form 16 — brief tooltip explains difference
- Multiple employer scenario common (job change in FY) — checklist dynamically adds entries

---

## Screen 35: Document Upload (Per Checklist Item)

**Purpose:** Upload a specific document from the ITR checklist.

**Layout:**
```
[TopNavBar: Back, "[Document Name]" title]
---
[Document context card]
  [Icon: document type specific]
  [Title: e.g. "Form 16 Part A — [Employer Name]"]
  [Description: "What to upload: The TDS certificate issued by your employer"]
  [Required fields to find: "Look for: Employee PAN, TAN, Total TDS deducted"]
  [GhostButton: "What does this look like?" — show sample image]

[Upload area]
  [FileUpload component — large drag/drop zone or tap area]
  [Accept: image/* + .pdf]
  [Max: 5MB]

[Or]
  [SecondaryButton: "Capture with Camera"]
  [SecondaryButton: "Choose from Gallery"]

[Uploaded preview — after upload]
  [Thumbnail + filename + size]
  [OCR confidence badge]
  [Extracted values preview: "Detected TDS: ₹45,000 | Period: FY 2024-25 | Verified: PAN matches"]
  [PrimaryButton: "Confirm & Continue"]
  [GhostButton: "Retake / Replace"]

[Validation messages]
  [Success: "PAN matches profile. FY verified."]
  [Warning: "Could not read clearly. Our team will review."]
  [Error: "This doesn't appear to be [document name]. Please upload correct document."]
```

**Key Components:**
- FileUpload, PrimaryButton, SecondaryButton, GhostButton
- AlertBanner (validation), StatusBadge, Skeleton

**Navigation:**
- Arrives: Checklist item upload button tap
- Exits to: Back to Document Checklist (with item now checked)

---

## Screen 36: Tax Computation Summary

**Purpose:** Show calculated tax liability under both Old and New regime for comparison.

**Layout:**
```
[TopNavBar: Back, "Tax Computation" title, Share icon right]
---
[FY and taxpayer info: "FY 2024-25 | [Name] | PAN: [masked]"]

[Regime selector tabs: "Old Regime" | "New Regime"]

[Active regime content]

[Section: Income Summary]
  [TaxBreakdownTable]
  [Row: Salary Income ₹X,XX,XXX]
  [Row: HRA Exemption (-) ₹XX,XXX — if old regime]
  [Row: Standard Deduction (-) ₹75,000]
  [Row: Other Income ₹X,XXX]
  [Gross Total Income row — bold]
  [Deductions (80C, 80D, etc.) rows — if old regime]
  [Total Taxable Income — highlighted row]

[Section: Tax Calculation]
  [Tax slab breakdown table]
  [Row: Up to ₹3L — 0%]
  [Row: ₹3L–₹7L — 5% — Tax: ₹XX,XXX]
  [Row: ₹7L–₹10L — 10% — Tax: ₹XX,XXX]
  [...remaining slabs]
  [Total Income Tax row]
  [Surcharge row (if applicable)]
  [Health & Ed Cess (4%) row]
  [Total Tax row — bold]
  [Section 87A rebate (-) row (if applicable)]
  [Net Tax Payable row — large, colored]

[Section: TDS Already Deducted]
  [Form 26AS/AIS data: Total TDS ₹XX,XXX]
  [TDS from Form 16: ₹XX,XXX]

[Net result row — prominent]
  [If refund: Green banner "Refund: ₹X,XXX"]
  [If tax due: Warning banner "Tax Due: ₹X,XXX — Pay before filing"]
```

**Key Components:**
- TaxBreakdownTable, AmountDisplay (positive/negative color)
- SegmentedControl (regime tabs), AlertBanner
- StatusBadge (tax slab rates)

**Navigation:**
- Arrives: Document Checklist "Continue"
- Exits to: Regime Comparison Screen, or ITR Approval Screen

---

## Screen 37: Regime Comparison Screen

**Purpose:** Side-by-side comparison of Old vs New regime with AI recommendation.

**Layout:**
```
[TopNavBar: Back, "Regime Comparison" title]
---
[AI recommendation banner]
  [Brand-colored: "AI Recommendation: New Regime saves you ₹12,340"]
  [Explanation: "Your deductions are below the standard deduction threshold"]

[Comparison table]
  [Column headers: Category | Old Regime | New Regime]
  [Row: Gross Taxable Income | ₹8,50,000 | ₹8,50,000]
  [Row: Standard Deduction | ₹50,000 | ₹75,000]
  [Row: 80C Deductions | ₹1,50,000 | Not applicable]
  [Row: 80D (Health Insurance) | ₹25,000 | Not applicable]
  [Row: HRA Exemption | ₹36,000 | Not applicable]
  [Row: Net Taxable Income | ₹5,89,000 | ₹7,75,000]
  [Row: Income Tax | ₹29,450 | ₹17,500]
  [Row: Cess (4%) | ₹1,178 | ₹700]
  [Row: Total Tax | ₹30,628 | ₹18,200]
  [Row: TDS Deducted | ₹30,000 | ₹30,000]
  [Row: Net Refund/Due | ₹628 refund | ₹11,800 refund — highlighted GREEN]

[Winner banner]
  [Large: "New Regime saves ₹12,340 for FY 2024-25"]

[Regime selection]
  [Radio: "Choose Old Regime"]
  [Radio: "Choose New Regime" — pre-selected per AI recommendation]
  [Note: "You can change this until filing. We recommend New Regime."]

[PrimaryButton: "Proceed with [selected regime]"]
[GhostButton: "Discuss with CA"]
```

**Key Components:**
- TaxBreakdownTable (comparison mode), AmountDisplay, RadioGroup
- AlertBanner (AI recommendation), PrimaryButton, GhostButton

**Navigation:**
- Arrives: Tax Computation Summary
- Exits to: ITR Approval Screen

**Indian UX notes:**
- Old vs New regime comparison is legally required from FY 2020-21 onwards
- AI recommendation should be simple, actionable — show rupee savings prominently
- Many users are confused about regimes — "Discuss with CA" escape hatch is important

---

## Screen 38: ITR Approval Screen

**Purpose:** Final user review and approval before SnapAccount files the return.

**Layout:**
```
[TopNavBar: Back, "Approve ITR" title]
---
[Summary review card]
  [Taxpayer: Name, PAN]
  [FY: 2024-25 | Form: ITR-1 or ITR-2 based on income]
  [Regime: Old / New (selected)]
  [Gross Income: ₹X,XX,XXX]
  [Total Tax: ₹XX,XXX]
  [TDS Deducted: ₹XX,XXX]
  [Refund/Due: highlighted AmountDisplay]

[Declaration checkboxes]
  [Checkbox: "I verify that the information provided is correct and complete"]
  [Checkbox: "I authorize SnapAccount to file my ITR on my behalf"]
  [Checkbox: "I understand I am responsible for the accuracy of this return"]

[Important notice if tax due]
  [Warning banner: "Tax Due: ₹X,XXX — please pay via Income Tax Portal before approval"]
  [GhostButton: "How to pay challan?"]

[PrimaryButton: "Approve & Authorize Filing" — enabled when all checkboxes ticked]
[GhostButton: "Request Changes — Contact CA"]
```

**Key Components:**
- Checkbox (x3), AmountDisplay, AlertBanner, StatusTimeline
- PrimaryButton, GhostButton, Card

**Navigation:**
- Arrives: Regime Comparison Screen
- Exits to: ITR Dashboard (FILING_IN_PROGRESS state) or E-Verification Screen

---

## Screen 39: E-Verification Screen

**Purpose:** Electronically verify the filed ITR — mandatory within 30 days of filing.

**Layout:**
```
[TopNavBar: Back, "E-Verify ITR" title]
---
[Urgency banner if within 10 days of 30-day deadline]
  [Warning: "E-verification required by [date]. [X] days remaining."]

[What is E-Verification info card]
  [Explanation: "E-verification confirms your identity and completes the filing process. Without this, your ITR is invalid."]

[Verification method selection]
  [Method Card: Aadhaar OTP — Recommended]
    [Description: "OTP sent to Aadhaar-linked mobile. Instant."]
    [PrimaryButton: "Verify via Aadhaar OTP"]

  [Method Card: Net Banking EVC]
    [Description: "Login to your bank's net banking to generate EVC"]
    [SecondaryButton: "Use Net Banking"]

  [Method Card: Bank Account EVC]
    [Description: "Pre-validated bank account generates EVC"]
    [SecondaryButton: "Use Bank EVC"]

  [Method Card: Digital Signature]
    [Description: "Use your DSC for digital signature verification"]
    [SecondaryButton: "Use DSC"]

--- After Aadhaar OTP selection ---

[OTP screen: standard OTPInput 6-digit]
[Timer + Resend]
[After OTP: PrimaryButton "Verify"]

--- Success ---
[Green checkmark animation]
[Heading: "ITR E-Verified Successfully!"]
[EVC reference number]
[Download acknowledgment button]
```

**Key Components:**
- OTPInput, Card (method selection), PrimaryButton, SecondaryButton
- AlertBanner (deadline warning), StatusBadge

**Navigation:**
- Arrives: ITR Dashboard (USER_APPROVED state) or filing complete notification
- Exits to: ITR Dashboard (E_VERIFIED state)

**Indian UX notes:**
- Aadhaar OTP is recommended — most users have Aadhaar-linked mobile
- 30-day deadline for e-verification is strictly enforced by IT department
- EVC via net banking requires redirect to bank portal — warn user they'll leave app

---

## Screen 40: Refund Tracking Timeline

**Purpose:** Visual timeline of ITR refund status after filing.

**Layout:**
```
[TopNavBar: Back, "Refund Tracking" title]
---
[Refund summary card]
  [Expected Refund: AmountDisplay large, green]
  [Bank account: XXXX (last 4 digits) for credit]
  [ITR Filed on: date]
  [E-Verified on: date]

[Refund Timeline — vertical StatusTimeline]
  [Step 1: ITR Filed ✓ — date]
  [Step 2: E-Verified ✓ — date]
  [Step 3: Under Processing — current (if applicable)]
  [Step 4: Refund Issued — pending]
  [Step 5: Credited to Bank — pending]

[Expected timeline info]
  [Info banner: "Refunds typically processed in 15-45 days after e-verification"]

[Check status button]
  [SecondaryButton: "Check on IT Portal" — opens in-app browser]

[Partial refund / adjustment notice]
  [If IT dept adjusted: Warning banner with amount and reason]

[No refund state]
  [Shows timeline ending at Filed/E-Verified with "No refund for this year" note]
```

**Key Components:**
- StatusTimeline, AmountDisplay, AlertBanner, Card
- SecondaryButton

**Navigation:**
- Arrives: ITR Dashboard refund section, or notification tap
- Exits to: Back to ITR Dashboard

---

## Screen 41: Notice List & Detail

**Purpose:** Manage received income tax notices (143(1), 139(9), etc.).

**Layout:**
```
[TopNavBar: Back, "Tax Notices" title]
---
[Filter chips: All | Pending | Responded | Closed]

[Notice list]
  [NoticeCard per notice]
  [Notice type: "Intimation u/s 143(1)"]
  [Date received | DIN (Document Identification Number)]
  [Brief description: "Demand of ₹1,234 raised" or "No demand — return processed"]
  [Response deadline: warning color if upcoming]
  [StatusBadge: PENDING / RESPONDED / CLOSED]

[Notice Detail (expanded or separate screen)]
  [Full notice text (if available)]
  [Demanded amount vs filed amount comparison]
  [Action required: clear description]
  [GhostButton: "Request CA Assistance"]
  [PrimaryButton: "Submit Response" — if response needed]

[Common notice types info:]
  143(1) — Intimation: Usually auto-processed, no action needed
  139(9) — Defective Return: ITR needs to be revised
  143(2) — Scrutiny: Detailed CA assistance required
  156 — Demand Notice: Payment required
```

**Key Components:**
- Card (notice list), StatusBadge, AlertBanner, PrimaryButton, GhostButton
- AmountDisplay (demand amount)

**Navigation:**
- Arrives: ITR Dashboard notice section or notification
- Exits to: Expert Chat (CA assistance), or Notice response workflow

**Indian UX notes:**
- 143(1) is the most common — usually just an acknowledgment, calm the user
- 139(9) defective return is time-sensitive — show deadline prominently
- 143(2) scrutiny is serious — prominently suggest CA assistance
