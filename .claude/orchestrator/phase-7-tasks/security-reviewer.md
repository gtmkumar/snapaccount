# Phase 7 Tasks — security-reviewer

> Ownership: `docs/security/` (read-only everywhere else). Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.

## HIGH priority

### S1 — Verify the Wave-1/2 security fixes (GAP-003/004/005/008)
- Re-audit after backend B1–B3 and B11 land: NEW-002, M1-R-001/002/003, SEC-030/031/032/036/037/041/042/056, NEW-003 (AES-GCM migration correctness incl. key handling + ciphertext format migration), I1.x items. Update the master table in `docs/security/security-report.md`.

### S2 — RBI Digital Lending compliance audit (GAP-021)
- Write `docs/security/digital-lending-compliance.md`: KFS implementation review (server-signed, immutable, pre-consent), cooling-off, consent revocation semantics, grievance-officer publication, partner-bank (LSP) security audit checklist, mobile permission-perimeter verification (camera/mic/location only — no contacts/SMS/call-log/broad storage).

## MEDIUM priority

### S3 — DPDP Rules 2025 compliance assessment (GAP-020)
- Write `docs/security/dpdp-compliance.md`: consent-record audit (granular, versioned, withdrawable, audited), privacy-center coverage (access/correct/erase), notice language coverage, Significant-Data-Fiduciary obligations (DPO, annual DPIA, algorithmic verification for AI features), breach-notification readiness (72h DPB + 6h CERT-In), data-localization confirmation (asia-south1), 7-year-retention justification mapping.

### S4 — VAPT plan + ongoing cadence (GAP-025)
- `docs/security/vapt-plan.md`: 6-monthly VAPT on critical systems / annual on non-critical with documented risk-based scoping (RBI Master Direction alignment); define "critical" classification for our 12 services + mobile app; pre-launch penetration test checklist.
