---
name: Phase 5 Security Fix Patterns
description: Security fix quality patterns and new defects introduced during Phase 5 fixes; blocker status going into Phase 6
type: project
---

Phase 5 fixes resolved all 3 Critical and all 9 High findings from Phase 4. One new High was introduced.

**Why:** Backend-agent fixed 18 findings in a single phase. Comment/code mismatches crept in under time pressure.

**Key defect introduced (NEW-002):** `RequestAccountDeletionCommandHandler` — inline comment says Firebase revocation is "non-fatal" but code returns the failure result, blocking deletion. One-line fix needed.

**Pattern to watch:** Backend-agent tends to write correct intent in comments but implement contradictory error handling (fatal vs non-fatal). Flag this pattern on any future deletion, revocation, or cross-service cascade handlers.

**AES-CBC vs AES-GCM (NEW-003):** PAN encrypted with AES-256-CBC. CBC provides no integrity guarantees. Flag any future at-rest encryption using CBC — push toward GCM.

**HMAC comparison (NEW-001):** Webhook HMAC comparison compares UTF-8 bytes of hex strings rather than decoded raw bytes. Functionally safe but non-standard. Fix before prod.

**How to apply:** In future phases, when reviewing account lifecycle handlers (deletion, suspension, revocation), explicitly check that error handling matches the stated intent in comments. Also verify any new encryption code uses GCM mode.
