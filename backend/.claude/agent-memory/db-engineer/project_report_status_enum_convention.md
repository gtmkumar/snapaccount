---
name: report-status-enum-convention
description: House UPPER_SNAKE status-vocabulary convention for DB CHECK constraints, and the recurring EF .HasConversion<string>() PascalCase mismatch trap.
metadata:
  type: project
---

The house convention for status/enum string columns in SnapAccount's Postgres is **UPPER_SNAKE** (e.g. `auth.user_profile.kyc_status` = PENDING/IN_PROGRESS/VERIFIED/REJECTED; `document.document.status` = UPLOADED/OCR_IN_PROGRESS/...). CHECK constraints enumerate the allowed UPPER_SNAKE values.

**Recurring trap (Wave 7, migration 088, `report.report.status`):** EF entity configs frequently map status enums with `.HasConversion<string>()`, which persists the **PascalCase C# member name verbatim** (`Queued`/`Processing`), NOT UPPER_SNAKE. This silently diverges from any UPPER_SNAKE DB CHECK and breaks the write path at INSERT (CHECK violation). The DB half (CHECK + DEFAULT realign) is db-engineer's; the EF converter must be changed by backend-agent to `.HasConversion(v => v.ToString().ToUpperInvariant(), v => Enum.Parse<T>(v, true))` — both halves must land together.

**Why:** orchestrator's standing decision is to align the DB to the C# enum *under UPPER_SNAKE*, not to bend the DB to PascalCase. When you fix a status CHECK, always grep the matching `*Configuration.cs` for `.HasConversion<string>()` and flag the backend converter dependency in the migration comment + final report.

**How to apply:** for any status-column CHECK/realign migration: (1) write CHECK values in UPPER_SNAKE; (2) realign the column DEFAULT if it references a removed value; (3) check the EF config's conversion and explicitly flag to backend-agent if it emits PascalCase. Guard DROP CONSTRAINT on the old value still being present in `pg_get_constraintdef`, DEFAULT change on the old default text, type widen on `character_maximum_length`.

Also: `report.report.financial_year` is **overloaded** — the GAP-043 chat-thread-PDF flow encodes a 36-char UUID thread id into it (ChatThreadPdfGenerator/Reports.cs) to avoid bespoke DDL. Widened to varchar(40) in 088. If a future task touches this column, remember it is NOT always a FY label.
