# Phase 7 Task Board — Index

> Source: `.claude/orchestrator/gap-analysis-2026-06-10.md` (read it first — every task below references a GAP-xxx item with full Issue/Impact/Solution detail)
> Created: 2026-06-10 by orchestrator review
> Rules: strict file ownership per `CLAUDE.md`; all agents report to orchestrator via SendMessage; visual QA screenshots required for every new UI surface; integration tests hit real Postgres.

## Files

| File | Agent | High-priority tasks | Total tasks |
|------|-------|--------------------|-------------|
| `backend-agent.md` | backend-agent | 9 | 24 |
| `frontend-dev.md` | frontend-dev | 3 | 13 |
| `mobile-dev.md` | mobile-dev | 3 | 12 |
| `db-engineer.md` | db-engineer | 1 | 5 |
| `devops-engineer.md` | devops-engineer | 4 | 9 |
| `qa-web.md` | qa-web | 1 | 5 |
| `qa-mobile.md` | qa-mobile | 1 | 4 |
| `security-reviewer.md` | security-reviewer | 2 | 4 |
| `ui-ux-agent.md` | ui-ux-agent | 2 | 5 |

## Team-lead action items (cannot be delegated to agents)

| # | Action | Blocks | Ref |
|---|--------|--------|-----|
| TL-1 | Restore GitHub Actions billing | All CI work, GAP-071, GAP-080 | GAP-002 |
| TL-2 | Authorize Firebase service-account key rotation | GAP-001 | GAP-001 |
| TL-3 | Initiate GSTN/IRP/EWB sandbox onboarding (3–6 wk lead) | Production GST filing | P6-FLAG-04 |
| TL-4 | MSG91 DLT sender-ID registration (TRAI) | Production SMS | P6-FLAG-05 |
| TL-5 | SendGrid SPF/DKIM DNS records | Production email | P6-FLAG-06 |
| TL-6 | Approve GCS Bucket Lock (irreversible) for loan packages | Loan retention compliance | P6-FLAG-08 |
| TL-7 | Pilot partner-bank credentials into GCP Secret Manager | Bank pilot | P6-FLAG-09 |
| TL-8 | Memorystore Redis tier decision (BASIC vs STANDARD_HA) | Prod infra budget | P6-FLAG-10 |
| TL-9 | Acknowledge Decision #10 (12th microservice) + Cloud Scheduler decision | Bookkeeping | P6-FLAG-01/02 |
| TL-10 | Appoint DPO + grievance officer (DPDP Rules 2025 require India-based, published contact) | GAP-020/021 | New |

## Dispatch order (waves)

1. **Wave 0 (now):** TL-1..TL-10 kickoff; security-reviewer T1; devops D1/D2.
2. **Wave 1 (core loop):** backend B1–B6; frontend F1–F2; mobile M1; db DB1.
3. **Wave 2 (compliance & money):** backend B7–B12; mobile M2–M4; ui-ux U1–U2; devops D3–D5.
4. **Wave 3 (feature completion):** backend B13–B19; frontend F3–F9; mobile M5–M8; db DB2–DB3.
5. **Wave 4 (hardening):** qa-web/qa-mobile suites; remaining Medium/Low items.

Each wave returns to the orchestrator approval gate before the next is dispatched.
