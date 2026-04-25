---
name: Toast system and alert() removal
description: sonner toast library added; all alert()/window.confirm() replaced with toast + inline confirm banners; npm had pre-existing peer dep conflict requiring --legacy-peer-deps
type: project
---

Toast library `sonner` v1.5.0 added to `src/admin/package.json`. `<Toaster />` mounted in `App.tsx` wrapping `RouterProvider`, configured with `position="top-right"`, `richColors`, `closeButton`, `duration=4000`.

All `alert()` and `window.confirm()` calls replaced across 5 files:
- `DocumentReviewPage.tsx` — `alert()` → `toast.success()`/`toast.error()`; `window.confirm()` → `showRejectConfirm` useState + inline red banner between top-bar and split panel
- `GstFilingQueuePage.tsx` — `alert()` → `toast.success()`/`toast.info()`; calls were inside `buildGstColumns()` plain function (not a hook) so `toast` direct import works fine
- `UserListPage.tsx` — `window.confirm()`+`alert()` → `suspendTarget` useState; `buildUserColumns()` accepts an `onSuspendRequest` callback; inline amber banner renders above the filter Card
- `PaymentGatewaySettings.tsx` — `window.confirm()` → `showLiveModeConfirm` useState + inline amber banner inside the mode toggle Card
- `WhatsAppSettings.tsx` — `window.confirm()` → `showEnableConfirm` useState + inline blue banner

**Why:** Column builder functions (`buildGstColumns`, `buildUserColumns`) are plain functions outside the component — they receive callbacks as params rather than calling hooks. This is the established pattern in the codebase.

**How to apply:** When adding future confirmation flows in table column builders, pass callbacks from the component rather than trying to use hooks inside the builder function.

npm had a pre-existing peer dependency conflict (`@eslint/js@10.0.1` requires `eslint@^10` but project pins `eslint@^8`). Use `--legacy-peer-deps` for all installs. Also `@testing-library/dom` was missing from node_modules — had to install it explicitly; it landed in dependencies (not devDependencies) via `npm install @testing-library/dom --legacy-peer-deps`.
