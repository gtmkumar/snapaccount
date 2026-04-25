# Microservice Count Update — Follow-up Note

**Status:** Pending orchestrator action  
**Priority:** Non-blocking nit  
**Raised by:** devops-engineer (Phase 6B/6D dispatch)

---

## Issue

`CLAUDE.md` (root, line ~12) currently reads:

> Backend: .NET 10, C# 14, Clean Architecture, EF Core 10, .NET Aspire, MediatR, Microservices **(11 services)**

This count is stale. Per Architecture Decision #10 (Phase 6E), **CallbackService** was added
as the 12th microservice. The correct count is **12 services**.

## Why devops-engineer cannot fix this

`CLAUDE.md` is owned by the **orchestrator** agent per file ownership rules in CLAUDE.md itself:

> orchestrator -> .claude/orchestrator/

And CLAUDE.md itself is a project-wide shared file that only the orchestrator should update to
avoid conflicting changes from multiple agents.

## Requested action (orchestrator)

Update `CLAUDE.md` line ~12 from:

```
Microservices (11 services)
```

to:

```
Microservices (12 services)
```

Also update the "Microservices" section (line ~104) which lists the 11 services:

```
Auth, Document, Accounting, GST, Loan, ITR, Chat, Notification, Report, Subscription, AI
```

to include Callback:

```
Auth, Document, Accounting, GST, Loan, ITR, Chat, Notification, Report, Subscription, AI, Callback
```

## Evidence

- `infra/cloud-run-services.sh` — deploys 12 services including `callback-service`
- `infra/setup.sh` — creates `callback-service-sa` service account (Phase 6E comment)
- `.claude/orchestrator/phase-6E-scope.md` — defines CallbackService as 12th microservice
