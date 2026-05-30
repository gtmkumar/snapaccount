# Memory Index

- [Phase 5 test coverage fix](project_phase5_test_fix.md) — vitest per-file thresholds used to pass coverage check with 56/56 tests; why global 70% threshold was unworkable
- [Self-test fixes 2026-04-05](project_selftest_fixes.md) — dev server on port 3000; DEV_AUTH_BYPASS env needed; mobile sidebar fix; ESLint setup; 20 unused-import warnings fixed
- [Toast system and alert() removal](project_toast_system.md) — sonner added; 5 files fixed; column builder callback pattern; --legacy-peer-deps required for npm installs
- [DataTable overflow clipping for dropdowns](project_datatable_overflow_pattern.md) — use position:fixed + getBoundingClientRect for any popover/dropdown inside DataTable cells; linter auto-flips top-N to bottom-N on table row dropdowns
- [Phase 6A+6E Completion](project_phase6_completion.md) — dual-render test pattern (findAllBy*); pre-existing failing tests; i18n/zod setup; all Phase 6 deliverables
- [Phase 6B+6D Completion](project_phase6BD_completion.md) — GST notices/IRP/EWB/HsnSac + ITR CA panel; real schema field names; 154→243 tests; type mock patterns
- [Phase 6C Loan Hub Completion](project_phase6C_completion.md) — 4 loan pages + 8 UI primitives + loanApi/reportApi; 319→411 tests; t() second-arg must be vars object not string
- [Phase 6F Completion](project_phase6F_completion.md) — FINAL phase: settings API wiring (6 sections), Dialog fix, StubPage cleanup, test fixes; 485/485 tests, 0 lint errors
- [SEC-045 PayloadViewer OAuth hotfix](project_sec045_fix.md) — Bearer ***{last6} masking; 4 new tests; 34 pre-existing lint warnings also fixed
- [Auth/RBAC Module 1 Completion](project_rbac_module1.md) — roles matrix, orgs list/detail, invite acceptance, permission-gated nav; 699 tests, 0 lint errors
