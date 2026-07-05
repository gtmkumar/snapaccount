---
name: subscription-gap-impl-2026-06-28
description: DG-SUB-07/08/11/12 subscription gap implementations shipped 2026-06-28
metadata:
  type: project
---

DG-SUB-07 (Invoice PDF): Added QuestPDF package to Platform.Infrastructure.csproj; created ISubscriptionPdfGenerator interface in Application/Subscription/Common/Interfaces; created SubscriptionInvoicePdfGenerator in Infrastructure/Subscription/Services; updated GenerateInvoiceCommand to call PDF generator + return pdfGcsUri; updated InvoiceConfiguration to map refund/void columns.

DG-SUB-08 (Proration Preview): Created GetProrationPreviewQuery in Application/Subscription/Subscriptions/Queries/GetProrationPreview. Route: GET /subscriptions/me/proration-preview?newPlanId={guid}. Requires subscription.read permission.

DG-SUB-11 (Pause/Resume/Refund/Void): Added MarkRefunded/Void/RefundedAt/RefundReason/VoidedAt to Invoice domain entity. Created PauseSubscriptionCommand, ResumeSubscriptionCommand (subscription.manage), RefundInvoiceCommand, VoidInvoiceCommand. Routes: POST /{id}/pause, /{id}/resume, /invoices/{id}/refund, /invoices/{id}/void.

DG-SUB-12 (Org name resolution): ListSubscribersQuery now takes IAuthDbContext and batch-resolves org BusinessName + Gstin from auth.organizations. No N+1 (single IN-clause). Falls back to UUID string if org not found. SubscriberRowDto has new Gstin field (nullable).

Migration 100 added: extends subscription_invoice status CHECK to include PENDING/FAILED/REFUNDED; adds refunded_at/refund_reason/voided_at columns; seeds subscription.read + subscription.manage permissions.

Build: 0 errors. Migration file: database/migrations/100_subscription_invoice_refund_void_status.sql.

**Why:** Gap audit 2026-06-28 identified these as medium-severity gaps that broke admin UX (PDF download button permanently hidden, org UUID in subscriber list, no proration preview step, no pause/refund/void actions).

**How to apply:** Both Auth and Subscription in same Platform composite — IAuthDbContext injection for cross-module org lookup is the preferred pattern (avoids HTTP calls, uses same DB connection).
