# Disaster Recovery Plan (RPO / RTO, multi-region, failover)

**Gap:** GAP-115 (`gap-analysis-2026-06-28-tier3.md`)
**Owner:** devops-engineer (plan), team lead (approval + drill scheduling)
**Status:** Plan defined. Cross-region replica provisioning + first failover drill are deploy-time / TL-gated.
**DPDP Act 2023 reference:** Data availability obligation; **data localization** — all DR copies stay within India.

---

## 1. Why this exists

The risk register (`project-brief.md §15`) names "GCP region outage" with only a vague
"multi-region failover consideration" and never converted it to targets or a tested plan.
`backup-restore-runbook.md` covers backup *verification* and a PITR drill, but:

- there were **no stated RPO/RTO targets**, so "is the restore fast enough?" had no pass bar;
- the first PITR restore drill (NEW-D05) was authored but **never executed**;
- there was **no failover posture** for a full `asia-south1` region loss.

This document fills those three gaps. It complements — does not replace — the backup runbook.

---

## 2. Recovery objectives (RPO / RTO)

**RPO** (Recovery Point Objective) = maximum acceptable data loss.
**RTO** (Recovery Time Objective) = maximum acceptable time to restore service.

| Tier | Data / service | RPO | RTO | Rationale |
|---|---|---:|---:|---|
| **0 — Critical** | PostgreSQL (`auth`, `accounting`, `gst`, `itr`, `loan`, `subscription` schemas) | **≤ 5 min** | **≤ 1 h** | Financial + compliance records; money movement and filings. PITR transaction-log retention bounds RPO. |
| **1 — High** | Document objects (GCS `*-documents`), loan packages (`*-loan-packages`) | **≤ 15 min** | **≤ 4 h** | 7-year DPDP retention; recoverable from object versioning + dual-region. |
| **2 — Standard** | Reports (`*-reports`), audit logs (`*-audit-logs`) | **≤ 1 h** | **≤ 8 h** | Regenerable (reports) or append-only (audit) — tolerate longer restore. |
| **3 — Transient** | Redis (SignalR backplane, caches), Pub/Sub in-flight | **best-effort** | **≤ 1 h** | Rebuildable; Pub/Sub 7-day retention prevents event loss during downtime. |

These targets are the **pass bar** for the quarterly drill scoring template
(`backup-restore-runbook.md §5`): a PITR restore that exceeds the Tier-0 RTO of 1 h is a drill FAIL.

---

## 3. Posture per data store

### 3.1 Cloud SQL for PostgreSQL — `snapaccount-postgres` (`asia-south1`)

**Steady state (HA):**
- **Regional (HA) configuration** — a synchronous standby in a second zone of `asia-south1`.
  Automatic failover to the standby on primary-zone loss (typically < 60 s); this alone covers
  a *zone* outage with near-zero RPO and meets Tier-0 RTO.
- **Automated daily backups** at 02:00 IST, 7-day retention (existing — see backup runbook §1).
- **PITR enabled** — transaction-log retention 7 days. This bounds Tier-0 RPO to the log-flush
  interval (≤ 5 min in practice).

**Region loss (`asia-south1` unavailable):**
- **Cross-region read replica** in `asia-south2` (Delhi) — stays within India for DPDP
  localization. On a confirmed region outage, **promote the replica** to a standalone primary
  and repoint the app (see §4). Replica lag is the cross-region RPO (target ≤ 5 min; alert at 60 s).
- ⚠️ **To provision (deploy-time / TL-gated):** the cross-region replica is **not yet created** —
  add it via `gcloud sql instances create snapaccount-postgres-dr --master-instance-name=snapaccount-postgres --region=asia-south2`
  (or the equivalent in `infra/setup.sh`). Until then, region-loss recovery falls back to a
  **restore-from-backup into `asia-south2`**, which meets RTO only if backups are exported
  cross-region (see §3.3).

### 3.2 Application tier (Cloud Run composites + gateway)

- Cloud Run images live in **Artifact Registry** (multi-region or replicated). Redeploying the
  3 composites + gateway into `asia-south2` is a config change (region + DB connection name),
  not a rebuild — scripted in the promotion flow (`staging-to-prod-promotion.md`).
- Stateless: no DR data to recover. RTO is dominated by the database promotion, not the app.
- Gateway rate-limit + correlation-id (GAP-112/114) and all secrets are region-agnostic
  (Secret Manager is global within the project).

### 3.3 Google Cloud Storage (documents, loan packages, reports, audit logs)

- **Dual-region buckets** spanning `asia-south1` + `asia-south2` for Tier-1 buckets
  (`*-documents`, `*-loan-packages`) so a single region loss does not lose objects and reads
  continue. Object **versioning** stays enabled (DPDP erasure recovery window — backup runbook §2).
- Tier-2 buckets (`*-reports`, `*-audit-logs`) may remain single-region; reports regenerate and
  audit logs are also shipped to the audit sink.
- ⚠️ **To verify/provision:** confirm Tier-1 buckets are dual-region (`gcloud storage buckets describe`),
  and that Cloud SQL backups are **exported to a dual-region bucket** so a backup-based restore
  into `asia-south2` is possible even without the read replica.

### 3.4 Redis / Pub/Sub

- **Redis** — SignalR backplane + caches; rebuildable, no DR copy needed. A fresh instance in the
  failover region restores SignalR fan-out (REST messaging is unaffected meanwhile).
- **Pub/Sub** — topics retain messages 7 days; subscriptions survive service downtime up to 7 days
  (backup runbook §3). No DR action beyond re-pointing consumers in the failover region.

---

## 4. Failover runbook — full `asia-south1` region loss

> Execute only on a **confirmed, sustained** region outage (GCP status + monitoring). A zone
> outage is handled automatically by Cloud SQL HA — do **not** run a manual failover for a zone blip.

1. **Declare.** Incident commander declares a DR event (`incident-response.md`); start the clock
   against the Tier-0 RTO (1 h).
2. **Database.**
   - *Replica path (preferred):* promote the `asia-south2` read replica to a standalone primary:
     `gcloud sql instances promote-replica snapaccount-postgres-dr`. Capture the new connection name.
   - *Backup path (fallback):* restore the latest cross-region backup / PITR into a new
     `asia-south2` instance (`gcloud sql instances clone … --point-in-time=…`).
3. **Secrets.** Update the DB connection-name secret (and any region-pinned config) in Secret Manager.
4. **App tier.** Deploy the gateway + 3 composites to Cloud Run in `asia-south2` pointed at the new
   DB (promotion script with `REGION=asia-south2`). Bring up a Redis instance in-region.
5. **Pub/Sub / Scheduler.** Re-attach subscriptions; verify recurring-jobs + partition-maintenance
   schedulers fire (`recurring-jobs-decision.md`).
6. **DNS / ingress.** Repoint the public endpoint (load balancer / custom domain) to the
   `asia-south2` gateway.
7. **Verify.** Smoke-test auth (OTP→session-JWT), one financial write per Tier-0 schema, document
   upload/read, and a Razorpay webhook. Confirm the correlation-id appears end-to-end.
8. **Communicate.** Post status; record the timeline.

### Failback (after `asia-south1` recovers)

- Re-establish replication `asia-south1 ← asia-south2` (now primary), let it catch up, then
  schedule a **planned** failback in a change window (reverse of §4). Never failback hot.

---

## 5. Testing & validation

| Drill | Cadence | Scope | Pass bar |
|---|---|---|---|
| **PITR restore** (NEW-D05) | Quarterly | `infra/scripts/pitr-drill.sh` into staging | Restore < 15 min; Tier-0 RTO ≤ 1 h |
| **GCS object restore** | Quarterly | versioned-object delete + restore | < 5 min; checksum match |
| **Region failover (tabletop)** | Semi-annual | Walk §4 on staging; promote a staging replica | All steps executed; RTO measured |
| **Full failover (live)** | Annual (TL-approved window) | Execute §4 end-to-end on staging | Service restored within Tier-0 RTO |

- The PITR drill closes **NEW-D05** once executed and a report is filed in
  `docs/devops/drill-reports/YYYY-MM-DD.md`. The plan is not "done" until that first record exists.
- File DR/failover drill results alongside backup drills; any miss against an RPO/RTO target opens
  a GitHub issue labelled `infra-reliability`.

---

## 6. Open items (deploy-time / TL-gated)

1. **Provision the `asia-south2` cross-region read replica** for `snapaccount-postgres`
   (add to `infra/setup.sh`). Needs project + `gcloud` auth.
2. **Confirm/convert Tier-1 GCS buckets to dual-region** and **export Cloud SQL backups
   cross-region**.
3. **Execute the first PITR drill** (NEW-D05) and file the report.
4. **Run the first tabletop failover** against staging and record measured RTO vs the §2 targets.

All four require an authenticated GCP project and a change window — they are operational
execution items, not code, and are owned by devops-engineer with team-lead scheduling.

---

## Related files

- `docs/devops/backup-restore-runbook.md` — backup verification + PITR drill script + scoring template
- `docs/devops/incident-response.md` — incident declaration / comms (CERT-In/DPDP)
- `docs/devops/data-residency-map.md` — DPDP data-localization map (India-only DR regions)
- `docs/devops/observability-slos.md` — SLOs / monitoring that detect a region outage
- `docs/devops/staging-to-prod-promotion.md` — region-parameterized deploy flow used during failover
- `infra/scripts/pitr-drill.sh` — automated PITR drill (NEW-D05)
