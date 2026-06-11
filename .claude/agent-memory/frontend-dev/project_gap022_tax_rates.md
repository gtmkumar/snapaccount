---
name: project_gap022_tax_rates
description: GAP-022 GST Tax Rate Configuration admin page — effective-dated rate management
metadata:
  type: project
---

GAP-022 GST Tax Rate Config page built (Wave 6 batch 2). Route /gst/tax-rates, permission gst.admin.taxrates.

**Why:** Indian compliance mandate — GST rates must be configuration-driven, zero code deployments when government announces policy changes.

**What was built:**
- `src/lib/gstApi.ts` — 5 new exports: TaxRateDtoSchema, TaxRateListSchema, EffectiveTaxRateDtoSchema, CreateTaxRateResponseSchema, GST_SLABS constant (0,1.5,3,5,7.5,12,18,28), computeTaxBreakdown() helper; 4 API functions: listTaxRates, getEffectiveTaxRate, createTaxRate, deactivateTaxRate
- `src/pages/gst/GstTaxRatesPage.tsx` — full page with filter tabs (active/historical/all), create modal, deactivate confirm dialog, compliance banner
- Route `/gst/tax-rates` added BEFORE `/gst/:id` dynamic catch-all (critical ordering)
- Sidebar entry gated by gst.admin.taxrates + SUPER_ADMIN/OPERATIONS_MANAGER roles
- 57 i18n keys added to en/hi/bn (in parity)
- `src/__tests__/GstTaxRatesPage.test.tsx` — 25 tests

**Key technical details:**
- Zod v4 UUID validation is strict: requires version nibble [1-8] and variant nibble [89abAB] — use pattern `a0a0a0a0-0000-4000-8000-0000000000xx` in tests
- EmptyState component uses `variant` prop (not `icon` prop) — variants: generic, callbacks, etc.
- computeTaxBreakdown: cgst = sgst = ratePct/2 (rounded to 2dp), igst = ratePct
- GST_SLABS includes 1.5, 3, 7.5 (intermediate slabs) in addition to the main 5
- Backend permission is `gst.admin.taxrates` (single permission for both read admin view and writes)
- Read endpoints are auth-required but NOT permission-gated; write endpoints require gst.admin.taxrates

**Test count:** 1022 → 1047 (25 new), 0 lint errors, build clean.

**How to apply:** When adding any effective-dated config management page, follow this pattern: filter tabs (active/historical/all), create modal with auto-computed breakdown, soft-deactivate with confirm, compliance banner.
