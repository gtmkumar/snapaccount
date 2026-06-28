---
name: project-3composite-topology
description: Current Cloud Run deployment topology for SnapAccount (3 composites + YARP gateway), service names, health endpoints, and IAM service accounts
metadata:
  type: project
---

## Canonical topology (post feature/repository-refactor)

**5 Cloud Run deployables:**
- `platform-service` — Platform.WebApi (.NET 10); modules: Auth, Subscription, Notification; port 5201 local / 8080 Cloud Run; SA: platform-service-sa; health: `/healthz`
- `finance-service`  — Finance.WebApi  (.NET 10); modules: Document, Accounting, GST, Loan, ITR, Report; port 5202 local / 8080 Cloud Run; SA: finance-service-sa; health: `/healthz`; memory: 1Gi
- `assist-service`   — Assist.WebApi   (.NET 10); modules: Chat, AI, Callback; port 5203 local / 8080 Cloud Run; SA: assist-service-sa; health: `/healthz`; memory: 1Gi; session-affinity=ON (SignalR)
- `api-gateway`      — Gateway (.NET 10, YARP); public ingress, stateless; SA: api-gateway-sa; health: `/healthz`; concurrency: 200
- `admin-panel`      — React 19 + nginx; SA: default compute; health: `/` (nginx root)

**Key conventions:**
- All 3 composites expose `/healthz` (NOT `/health`) — `MapHealthChecks("/healthz")` in each Program.cs
- Gateway also exposes `/healthz` via `MapGet("/healthz", ...)` in Gateway/Program.cs
- Module namespaces unchanged (e.g. AuthService.Application, GstService.Application)
- 12 module schemas in 1 shared PostgreSQL DB instance (schema-per-module)

**Why:** 12→3 composite consolidation on branch `feature/repository-refactor` (commit 86deea2)
**How to apply:** Always use the 5-service list above in any runbook, workflow, or deployment script. The obsolete 11/12-service list (auth-service, document-service, ...) referred to Cloud Run services that no longer exist.

Related: [[gap-dg-infra-05-runbook-updates]]
