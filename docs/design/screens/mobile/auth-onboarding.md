# Mobile Screens: Auth & Onboarding (Screens 1–7)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 1: Splash Screen

**Purpose:** Brand presentation during app initialization and token refresh.

**Layout:**
- Full-screen, no status bar content (edge-to-edge)
- Background: Gradient from `color-brand-700` (top) to `color-brand-500` (bottom)
- Center: SnapAccount logo (white SVG), 120x120px
- Below logo: App name `text-3xl font-bold text-white` with tagline `text-base text-brand-200`
- Bottom 20%: Subtle animation of financial icons floating upward (receipts, coins)
- Bottom edge: "Made in India 🇮🇳" `text-xs text-brand-300` (optional, reinforces Indian identity)

**Key Components:** None (static screen)

**Navigation:**
- Arrives: App launch
- Exits to: Phone Number Entry (if no valid session), Home Screen (if valid refresh token exists)

**Timing:** 2.0s minimum display, then async token validation. Never show longer than 4s total.

**Interactions:** None. No skip button.

**Loading state:** Progress dots animation at bottom while checking auth.

**Indian UX note:** Avoid showing "Loading…" text — many users associate it with slow apps. Use progress animation only.

---

## Screen 2: Phone Number Entry

**Purpose:** Entry point for user registration and login via phone number.

**Layout:**
```
[TopNavBar: empty (no back), SnapAccount logo small]
---
[Illustration area: 40% height — person with phone, bill, checkmark — warm illustration style]
[Heading: "Welcome to SnapAccount" text-2xl font-bold]
[Subheading: "India's easiest GST & tax filing" text-base text-neutral-500]
---
[PhoneInput: +91 prefix, 10-digit entry, large]
[PrimaryButton: "Get OTP" — full width]
---
[GhostButton: "Continue with Google" — with Google icon]
[GhostButton: "Continue with Apple" — iOS only — with Apple icon]
---
[Bottom text: "By continuing, you agree to our Terms & Privacy Policy" text-xs text-neutral-500 with links]
```

**Key Components:** PhoneInput, PrimaryButton, GhostButton

**Navigation:**
- Arrives: From Splash Screen (no session)
- Exits to: OTP Verification Screen (on "Get OTP" tap)

**Key Interactions:**
- Numeric keyboard auto-shows on focus
- "Get OTP" disabled until 10 valid digits entered
- Phone validated (starts with 6/7/8/9) before API call
- Google/Apple sign-in opens system OAuth flow

**Empty state:** N/A

**Loading state:** "Get OTP" button shows spinner, phone input disabled during API call

**Error states:**
- Invalid number: Inline red text under input "Enter a valid 10-digit mobile number"
- Rate limit (3 attempts): "Too many attempts. Please try after 30 minutes."
- Server error: Toast "Something went wrong. Please try again."

**Indian UX considerations:**
- Keyboard type `numeric` not `tel` — avoids country code dialpad
- Auto-strip leading 0 if user types `09XXXXXXXX`
- Large PhoneInput field (48px height) for easy thumb typing

---

## Screen 3: OTP Verification

**Purpose:** Verify phone ownership via 6-digit OTP.

**Layout:**
```
[TopNavBar: Back arrow left, "Verify OTP" title]
---
[Top area 30%: animated envelope/phone icon with glow effect]
[Heading: "Enter OTP" text-2xl font-bold]
[Subtext: "Sent to +91 XXXXX XXXXX" text-base text-neutral-500]
[Change number link: "Not you? Change number" text-sm text-brand-500]
---
[OTPInput: 6-digit boxes, large, auto-focused on box 1]
---
[Timer: "Resend OTP in 0:45" text-sm text-neutral-500 — counts down]
[Resend link: "Resend OTP" — disabled until timer expires, then text-brand-500]
---
[PrimaryButton: "Verify" — full width, disabled until 6 digits entered]
```

**Key Components:** OTPInput, PrimaryButton, GhostButton (Resend)

**Navigation:**
- Arrives: From Phone Number Entry
- Exits to: Business Profile Wizard (new user) or Home Screen (returning user)

**Key Interactions:**
- Auto-advance focus box-to-box on digit entry
- Backspace moves focus back
- Paste: Auto-fills all 6 digits
- Auto-verify when 6th digit entered (no explicit tap needed)
- Timer countdown 5 minutes (300s) for OTP validity

**SMS Auto-read (Critical Indian UX feature):**
- **Android**: SMS Retriever API reads OTP automatically. User sees OTP boxes auto-fill with animation. No user action needed. Show brief toast "OTP auto-detected" `text-success-600`.
- **iOS**: Keyboard shows system OTP suggestion banner. Tap to fill. Text field `textContentType="oneTimeCode"`.

**Loading state:** After 6th digit, buttons disabled, spinner on Verify button.

**Error states:**
- Wrong OTP: Boxes flash red, "Incorrect OTP. 2 attempts remaining."
- Expired OTP: "OTP expired. Please request a new one."
- 3 failed attempts: Full screen error, "Please request a new OTP."

**Indian UX note:** 5-minute OTP window accounts for slow Indian SMS delivery. 30-minute cooldown after 3 failed attempts.

---

## Screen 4: Business Profile Wizard

**Purpose:** Multi-step setup for SME business owners — collects PAN, GSTIN, KYC, business details.

**Layout:** Stepper with 4 steps. Top progress bar shows completion.

```
[TopNavBar: Back arrow (goes to previous step), "Set Up Your Business" title]
[ProgressBar: step indicator "Step 1 of 4" + dots]
---
[Step content area — scrollable]
---
[Footer: "Continue" PrimaryButton — full width]
       ["Skip for now" GhostButton — only for non-mandatory steps]
```

### Step 4a: PAN Details

```
[Step heading: "Your PAN Card" text-xl font-bold]
[Subtext: "We'll verify your PAN to link your tax profile"]
---
[TextInput: "PAN Number" — format XXXXX9999X, all-caps, monospace]
[TextInput: "Full Name (as on PAN)" — text]
[DatePicker: "Date of Birth" — format DD/MM/YYYY]
---
[Note banner: Info-type "Your PAN is safe. We use it only for government portal verification." with lock icon]
```

### Step 4b: GSTIN Linking

```
[Step heading: "Link Your GST Number" text-xl font-bold]
[Subtext: "Optional — link GSTIN to auto-import your filing history"]
---
[TextInput: "GSTIN" — 15 characters, uppercase, format validated]
[StatusBadge: shows "Verified" after API check]
---
["Add another GSTIN" link — allows multiple GSTINs for multi-org]
[Toggle: "I'm not registered for GST" — hides GSTIN fields]
```

### Step 4c: KYC / Aadhaar Verification

```
[Step heading: "Complete KYC" text-xl font-bold]
[Subtext: "Required for loan applications and financial services"]
---
[TextInput: "Aadhaar Number" — 12 digits, masked display XXXX-XXXX-XXXX]
[PrimaryButton: "Send OTP to Aadhaar-linked mobile"]
[OTPInput: 6-digit Aadhaar OTP — appears after OTP sent]
---
[Note banner: Warning-type "Your Aadhaar number is masked and never stored in full — UIDAI guidelines."]
```

### Step 4d: Business Details

```
[Step heading: "Business Details" text-xl font-bold]
---
[TextInput: "Business Name"]
[Select: "Business Type" — Sole Proprietor / Partnership / Pvt Ltd / LLP / HUF / Other]
[Select: "Industry/Category" — searchable, 100+ options]
[TextInput: "Business Address Line 1"]
[TextInput: "Business Address Line 2"]
[Select: "State" — all 28 states + 8 UTs]
[TextInput: "PIN Code" — 6-digit Indian PIN]
[TextInput: "Annual Turnover (approx)" — INR, optional]
```

**Key Components:** TextInput, Select, DatePicker, OTPInput, PrimaryButton, Toggle, AlertBanner, StatusBadge

**Navigation:**
- Arrives: After OTP Verification (new user), or from Profile screen
- Steps: 4a → 4b → 4c → 4d → Home Screen
- Back arrow: Previous step (not app exit)

**Key Interactions:**
- PAN auto-capitalizes input
- GSTIN API verification shows spinner → success badge
- Aadhaar OTP flow is inline (no new screen)
- Aadhaar number shows masked as `XXXX XXXX 1234` after entry
- State dropdown auto-populated from PIN code if valid

**Loading states:** PAN/GSTIN verification spinner in input suffix

**Indian UX notes:**
- Aadhaar must follow UIDAI guidelines: number masked in display, never stored in full
- PIN code: Indian 6-digit postal code, not US ZIP
- "Sole Proprietor" is most common business type for target users

---

## Screen 5: Employee Profile Setup

**Purpose:** Profile setup for salaried employees using SnapAccount for ITR filing.

**Layout:** 4-step wizard, same structure as Business Profile Wizard.

### Step 5a: PAN & Basic Info
```
[TextInput: "PAN Number"]
[TextInput: "Full Name (as on PAN)"]
[DatePicker: "Date of Birth"]
[Select: "Resident Status" — Resident / NRI / RNOR]
```

### Step 5b: Aadhaar Verification
Same as Step 4c above.

### Step 5c: Employer Details
```
[TextInput: "Employer Name"]
[TextInput: "Employer TAN (optional)" — 10-char TAN]
[Select: "Employment Type" — Govt / PSU / Private / Self-employed]
[DatePicker: "Date of Joining"]
[Toggle: "Multiple Employers in this FY" — shows additional employer fields]
```

### Step 5d: Bank Account
```
[TextInput: "Account Number" — masked after entry]
[TextInput: "Confirm Account Number"]
[TextInput: "IFSC Code" — 11 chars, auto-fetches bank name]
[Display: "Bank: [Auto-detected bank name]" — shown after IFSC lookup]
[Note: "Bank details needed for ITR refund credit"]
```

**Key Interactions:**
- IFSC lookup API: 11 chars → auto-detect bank name, validate
- Account number masked after confirmation
- TAN validated (starts with letter, 10 chars)

---

## Screen 6: Language Selection

**Purpose:** Choose preferred language for the app interface.

**Layout:**
```
[TopNavBar: "Choose Language" title, optional skip right]
---
[Illustration: India map with language scripts]
[Heading: "What language do you prefer?"]
[Subtext: "You can change this anytime in Settings"]
---
[Language grid: 2 columns, large touch targets]
[Each item: Language name in that script + English name below]
---
[PrimaryButton: "Continue" — enabled when language selected]
```

**Languages (per project spec):**
- English (default, shown first)
- हिंदी (Hindi)
- বাংলা (Bengali)
- ગુજરાતી (Gujarati)
- தமிழ் (Tamil)
- తెలుగు (Telugu)
- ಕನ್ನಡ (Kannada)
- मराठी (Marathi)
- മലയാളം (Malayalam)
- ਪੰਜਾਬੀ (Punjabi)
- ଓଡ଼ିଆ (Odia)

**Key Components:** RadioGroup (language cards), PrimaryButton

**Navigation:**
- Arrives: After Business/Employee profile setup (first time), or from Settings
- Exits to: Permission Requests Screen (first time)

**Key Interactions:**
- Selecting a language instantly changes all UI text as preview
- Current selection highlighted with brand-500 border

---

## Screen 7: Permission Requests

**Purpose:** Request Camera, Notifications, and Storage permissions with clear rationale.

**Layout:** One permission per card, shown sequentially or as list.

```
[TopNavBar: "App Permissions" title]
[Subtext: "We need these permissions to work effectively for you"]
---
[Permission cards — stacked list]

[Card 1: Camera]
[Icon: camera, brand-colored circle bg]
[Title: "Camera Access" text-lg font-semibold]
[Reason: "To photograph bills and documents. Required for core functionality."]
[PrimaryButton: "Allow Camera"]
[GhostButton: "Not Now" — allows skip but warns functionality limited]

[Card 2: Notifications]
[Icon: bell]
[Title: "Push Notifications"]
[Reason: "For GST filing deadlines, ITR reminders, and expert chat messages."]
[PrimaryButton: "Allow Notifications"]
[GhostButton: "Not Now"]

[Card 3: Storage (Android only)]
[Icon: folder]
[Title: "Storage Access"]
[Reason: "To save downloaded reports and upload documents from gallery."]
[PrimaryButton: "Allow Storage"]
[GhostButton: "Not Now"]
---
[PrimaryButton: "Continue to SnapAccount" — shown after all permissions addressed]
```

**Key Components:** Card, PrimaryButton, GhostButton

**Navigation:**
- Arrives: After Language Selection (first time only)
- Exits to: Home Screen

**Key Interactions:**
- Each "Allow" button triggers native OS permission dialog
- If user taps "Not Now" on Camera: show brief warning "You won't be able to photograph documents. You can enable this in Settings later."
- Permission cards only shown for permissions not yet granted
- If all permissions already granted, screen skipped entirely

**Indian UX note:**
- Many Indian users distrust permission requests — provide specific, honest rationale for each.
- Camera is mandatory for core value prop — emphasize it's only for document capture.
- Do not batch all permission dialogs — one at a time prevents "permission fatigue" dismissal.
