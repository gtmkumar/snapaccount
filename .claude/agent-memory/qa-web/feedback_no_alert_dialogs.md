---
name: No native alert/confirm dialogs
description: Team lead explicitly rejected alert() and window.confirm() for financial platform UX — must use in-app toast/modal
type: feedback
---

Never accept native `alert()` or `window.confirm()` as a fix for missing UI feedback in SnapAccount admin panel.

**Why:** Team lead rejected this pattern on 2026-04-05 when frontend-dev used `alert('Changes saved as draft')` and `window.confirm('Reject this document?')` as the BUG-005 fix. Stated reason: not acceptable for a financial platform. Practically: these dialogs also block the Chrome renderer, freeze browser automation tools, and cannot be styled or interrupted.

**How to apply:** When reviewing a fix for any action button (Save Draft, Approve, Reject, Confirm, Submit), verify the feedback mechanism is an in-app component — toast notification, snackbar, or styled modal/dialog. If the source shows `alert(`, `window.confirm(`, or `window.alert(`, file a new bug immediately rather than marking the original bug as FIXED.
