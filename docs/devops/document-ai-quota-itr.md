# Document AI Quota — ITR Service (Form 16 OCR)

**Service:** ItrService  
**GCP API:** `documentai.googleapis.com`  
**Region:** `asia-south1` (Mumbai)  
**Processor type:** Form Parser or Custom Extractor (configured in `google-document-ai-config` secret)

---

## Overview

ItrService uses Google Document AI to extract structured data from Form 16 (TDS certificate
issued by employers). Extracted fields include: employee PAN, employer TAN, salary breakdowns,
TDS deducted, and assessment year. This powers auto-population of ITR-1/ITR-2 forms.

---

## Expected Throughput

### Peak Season

Tax season in India runs May–September (July 31 deadline for ITR-1/4; October 31 for ITR-2/3).
Form 16 uploads are concentrated in **June–July** immediately after employer issuance.

| Metric | Value | Basis |
|--------|-------|-------|
| Peak daily Form 16 uploads | ~1,200 | Assumed 10K active users, ~12% file in peak week |
| Peak hourly extraction rate | ~150/hour | Spread across 8 business hours |
| Targeted SLA | 50 extractions/hour sustained | Conservative baseline for quota planning |
| P99 single-extraction latency | ~8s | Document AI Form Parser typical latency |
| Average document size | 200–500 KB | Standard PDF Form 16 |

The 50/hour figure is the **minimum guaranteed throughput**. Actual capacity after quota
increase requests should target 150–200/hour for peak resilience.

### Off-Season

Outside May–September, Form 16 uploads are sporadic (belated filings, revisions).
Expected rate: < 10/hour. No burst planning required off-season.

---

## GCP Document AI Quotas (as of 2025)

Default quotas for `documentai.googleapis.com` in `asia-south1`:

| Quota | Default Limit | Notes |
|-------|--------------|-------|
| Online processing requests/minute | 120 req/min | Per project per region |
| Batch processing requests/day | 5,000 | Cumulative across processor types |
| Pages processed/minute (online) | 600 pages/min | Multi-page PDFs count per page |

At 50 extractions/hour = ~0.83/minute, the default quota is not a concern for baseline.
At 150/hour = 2.5/minute, still well within defaults.

**Risk window:** If a large employer batch-uploads Form 16s for 500+ employees simultaneously,
the per-minute rate could spike. ItrService must implement a semaphore/queue to cap concurrent
Document AI calls.

---

## Quota Increase Procedure

If sustained throughput is expected to exceed 100 requests/minute:

1. Go to: GCP Console → IAM & Admin → Quotas & System Limits
2. Filter by: `documentai.googleapis.com` + `asia-south1`
3. Request increase for: `Online processing requests per minute per project per region`
4. Justification template:
   ```
   SnapAccount processes Form 16 (TDS certificates) for SME income tax filing.
   Peak season (June–July) requires up to 150 extractions/hour sustained.
   Current default of 120/min is sufficient for baseline; requesting 300/min to
   accommodate batch uploads from large employers (500+ employees).
   ```
5. Approval typically takes 2–5 business days. Submit by **May 15** each year.

---

## Alert Thresholds

Configure Cloud Monitoring alerts on these metrics:

| Alert | Threshold | Action |
|-------|-----------|--------|
| `documentai.googleapis.com/request_count` error rate | > 5% over 10 min | Page on-call; check quota exhaustion |
| `documentai.googleapis.com/request_latencies` p99 | > 30s | Investigate Document AI regional issue |
| Dead-letter topic `snapaccount.document.ocr.completed.dead-letter` message count | > 10 | Extraction failures accumulating; check processor config |
| ItrService Cloud Run — pending requests | > 50 | Extraction queue backing up; scale up or throttle |

### Creating the alert (gcloud)

```bash
# Error rate alert (> 5% in 10-min window)
gcloud monitoring policies create \
  --notification-channels="<CHANNEL_ID>" \
  --display-name="Document AI ITR error rate" \
  --condition-filter='resource.type="consumed_api" AND metric.type="serviceruntime.googleapis.com/api/request_count" AND metric.labels.service="documentai.googleapis.com" AND metric.labels.response_code_class!="2xx"' \
  --condition-threshold-value=0.05 \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-aggregation-alignment-period=600s
```

---

## Processor Configuration

The `google-document-ai-config` Secret Manager secret contains processor IDs per document type:

```json
{
  "form16": {
    "processor_id": "REPLACE_ME",
    "location": "asia-south1",
    "processor_type": "FORM_PARSER"
  },
  "form26as": {
    "processor_id": "REPLACE_ME",
    "location": "asia-south1",
    "processor_type": "FORM_PARSER"
  }
}
```

Processor IDs are created manually in GCP Console → Document AI → Processors.
There is no gcloud CLI to provision processors — this is a console-only operation.

**To create a processor:**
1. GCP Console → Document AI → My Processors → Create Processor
2. Select type: `Form Parser` (for Form 16 structured extraction)
3. Region: `asia-south1`
4. Copy the processor ID (format: `abc1234def567890`)
5. Update the `google-document-ai-config` secret:
   ```bash
   gcloud secrets versions add google-document-ai-config --data-file=- <<'EOF'
   {"form16":{"processor_id":"<YOUR_ID>","location":"asia-south1","processor_type":"FORM_PARSER"}}
   EOF
   ```

---

## Cost Estimation

Document AI pricing (Form Parser, as of 2025):

| Tier | Price | Volume |
|------|-------|--------|
| First 1,000 pages/month | Free | — |
| 1,001 – 5,000,000 pages | $0.065/page | — |

At 1,200 Form 16s/month (1 page avg): ~$0 (within free tier).  
At 12,000/month (growth): ~$715/month. Plan for this tier by Year 2.

Multi-page Form 16s (2–3 pages) will multiply costs proportionally. Consider extracting
only the first relevant page if the second page contains only annexures.

---

## Related

- Secret: `google-document-ai-config` (provisioned in `infra/setup.sh`)
- Service: `backend/Services/ItrService/`
- Runbook: `docs/devops/itr-tax-slab-rollover-runbook.md`
- Scope: `.claude/orchestrator/phase-6D-scope.md`
