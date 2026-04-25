---
name: SnapAccount Redesign 2026 Design Decisions
description: Key design decisions from the April 2026 mobile UI redesign — color palette shift, component patterns, Indian fintech conventions
type: project
---

SnapAccount mobile app underwent a complete UI redesign on 2026-04-05.

**Why:** The original Blue (#2563EB) + Gray palette felt generic. The redesign targets premium Indian fintech positioning (Razorpay/CRED level).

**How to apply:**
- Brand color is now Indigo (#6366F1) — all new screens should use this
- Neutrals are Slate (cooler than gray) — e.g., neutral.900 = #0F172A
- Accent is Orange (#F97316) for CTAs and warm highlights
- Module colors: GST=Violet(#7C3AED), ITR=Cyan(#0891B2), Loan=Orange(#EA580C), Docs=Indigo(#6366F1)
- All back buttons use icon-in-rounded-square pattern (40x40, borderRadius:12, neutral.100 bg)
- Cards default to borderRadius:20, no border, shadow-first approach
- Buttons have brand-colored shadows on primary variant
- Gradient hero sections use LinearGradient (expo-linear-gradient)
- Letter-spacing: -0.3 to -0.5 on headings, 0.2-0.5 on labels/captions
- Touch targets: minimum 40x40 for icon buttons, 48-56 height for form buttons
- INR amounts: monospace font, Indian number formatting (lakh/crore)
