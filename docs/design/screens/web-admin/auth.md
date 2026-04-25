# Web Admin Screens: Authentication (Screens 56–57)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 56: Admin Login

**Purpose:** Secure login entry point for all admin panel users.

**Layout:**
```
[Two-column layout: 40% login panel left, 60% brand illustration right]

[Left panel: white, centered vertically]
  [SnapAccount logo: 160px wide, centered]
  [Heading: "Admin Portal" text-2xl font-bold text-neutral-800]
  [Subheading: "Sign in to your account" text-sm text-neutral-500]
  ---
  [Form]
    [TextInput: "Email Address" — type email, with mail icon prefix]
    [TextInput: "Password" — type password, with eye toggle suffix]
    [Row: Checkbox "Remember me" left | Link "Forgot password?" right — text-brand-500]
    [PrimaryButton: "Sign In" — full width — large]
  ---
  [Divider: or sign in with]
  [SecondaryButton: "Sign in with Google" — full width, Google icon]
  ---
  [Footer: text-xs text-neutral-400 "This portal is for authorized SnapAccount staff only."]
  [Security note: "All sessions are logged. Unauthorized access is prohibited."]

[Right panel: brand-700 bg]
  [Large illustration: Admin dashboard overview, financial charts, team members]
  [Overlay text: "Serve India's SMEs" — white, large]
  [Brand stats: "50K+ businesses served | 10L+ returns filed"]
```

**Key Components:**
- TextInput (email, password), Checkbox, PrimaryButton, SecondaryButton
- AlertBanner (error state)

**Navigation:**
- Arrives: Any admin URL when not authenticated (redirect)
- Exits to: Admin Dashboard (on successful login), based on role

**Key Interactions:**
- Enter key submits form
- Password field eye toggle shows/hides password
- "Remember me" sets session persistence (30 days)
- Google sign-in: Firebase OAuth flow for admin email domain validation
- Error states:
  - Wrong credentials: "Invalid email or password. 3 attempts remaining."
  - Account locked: "Account locked for 30 minutes due to too many failed attempts."
  - MFA prompt: If MFA enabled, navigates to MFA verification step inline

**Loading state:** "Sign In" button shows spinner, all inputs disabled

**Role-based redirect after login:**
- Data Entry Operator → Document Queue
- Support Executive → Operations Dashboard
- CA → GST/ITR Queues
- Operations Manager → Admin Dashboard
- System Admin → Admin Dashboard (full access)
- Partner Bank Rep → Loan Application Queue (restricted view)

**Security notes:**
- HTTPS enforced (HSTS headers)
- Session cookie: httpOnly, secure, sameSite=Strict
- Audit log: Every login/logout recorded with IP, timestamp, device

---

## Screen 57: Forgot Password / Reset

**Purpose:** Secure password reset flow for admin users.

**Layout:**
```
[Centered single-column form, max-width 440px, vertically centered]

[Step 1: Enter email]
  [Back to Login link: top left]
  [Heading: "Reset Your Password"]
  [Subtext: "Enter your work email. We'll send reset instructions."]
  ---
  [TextInput: "Work Email Address"]
  [PrimaryButton: "Send Reset Link"]

[Step 2: Check email (after submit)]
  [Success illustration: email/envelope icon, green]
  [Heading: "Check your email"]
  [Body: "Reset link sent to [email]. Valid for 30 minutes."]
  [GhostButton: "Resend email" — disabled 60s cooldown with countdown]
  [GhostButton: "Back to Login"]

[Step 3: New password form (on link click)]
  [Heading: "Set New Password"]
  [TextInput: "New Password" — password type]
  [TextInput: "Confirm New Password"]
  [Password strength indicator: ProgressBar with label Weak/Fair/Strong/Very Strong]
  [Password requirements list: 8+ chars, uppercase, lowercase, number, special char]
  [PrimaryButton: "Set New Password"]
  [On success: redirect to Login with toast "Password updated successfully. Please sign in."]
```

**Key Components:**
- TextInput, PrimaryButton, GhostButton
- ProgressBar (password strength), AlertBanner

**Navigation:**
- Arrives: Login screen "Forgot password?" link, or email reset link
- Exits to: Login Screen (after success or back button)

**Security notes:**
- Reset link: 30-minute expiry, single-use token
- Token invalidated on use
- New password logged in audit trail (not the value, just the action)
- Force logout of all sessions on password reset
