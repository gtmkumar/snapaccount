---
name: dg-notif-01-02-notification-fan-out
description: DG-NOTIF-01 (fan-out subscribers) + DG-NOTIF-02 (InApp adapter) — notification pipeline wired (2026-06-28)
metadata:
  type: project
---

DG-NOTIF-02 (DONE): Added InAppChannelAdapter that writes to notification.notification via InboxNotification.Create factory. InboxNotification entity gained a Create() factory (was read-only). Registered as IChannelAdapter in Platform.Infrastructure.Notification.DependencyInjection.

DG-NOTIF-01 (DONE): Wired 6 module event sources → notification fan-out:

## New subscribers in PlatformService (all GCP-gated):
- GstDeadlineEventsSubscriber: topic=snapaccount.gst.deadline-approaching → GST_DEADLINE_7_DAYS/3_DAYS/1_DAY; resolves org members via raw SQL (auth.org_member)
- ItrDeadlineEventsSubscriber: topic=itr-deadline-reminders → ITR_EFILE_VERIFY_D1..D29; AssesseeId==UserId
- DocumentEventsSubscriber: topic=snapaccount.document.ocr.completed → DOC_OCR_COMPLETED; resolves owner via document.documents.uploaded_by raw SQL
- DocumentLifecycleEventsSubscriber: topic=snapaccount.document.events → DOC_CLARIFICATION_REQUESTED
- ChatEventsSubscriber: topic=snapaccount.chat.new-message → CHAT_NEW_MESSAGE (per recipient, skip sender)
- CallbackEventsSubscriber: topic=snapaccount.callback.events → CB_SCHEDULED/CB_COMPLETED/CB_ESCALATED

## New publishers (GCP-gated):
- ChatService: IChatEventPublisher interface + ChatEventPublisher infra; injected as optional param in SendMessageCommandHandler; publishes to snapaccount.chat.new-message with recipient list
- CallbackService: ICallbackEventPublisher interface + CallbackEventPublisher infra; injected as optional param in ConfirmCallbackCommandHandler; publishes to snapaccount.callback.events
- DocumentService: IDocumentEventPublisher.PublishClarificationRequestedAsync added; implemented in DocumentEventPublisher; called from RequestClarificationCommandHandler (optional, fire-and-forget)

## Catalog additions:
- DOC_CLARIFICATION_REQUESTED (Push,InApp) — was the TODO in RequestClarificationCommand
- CHAT_NEW_MESSAGE (Push,InApp)

## DG-NOTIF-03 (also fixed): RecurringJobsSubscriber switch now uses catalog uppercase codes (GST_DEADLINE_3_DAYS, ITR_EFILE_VERIFY_D1, ITR_REFUND_CREDITED, SUB_RENEWAL_3_DAYS).

## Build: 0 errors, 22 pre-existing NU190x warnings.

## Pattern: optional DI injection for event publishers (null fallback = GCP not available). Fire-and-forget catches on notification publish. Raw SQL used for cross-schema user resolution (auth.org_member, document.documents). All event payload records extend DomainEvent for IPubSubPublisher constraint.

**Why:** DG-NOTIF-01/02 were critical gaps — inbox was empty for all users (InApp adapter null), and 24/26 event types had no subscriber so notifications were silently dropped.
**How to apply:** Any future cross-service notification path should follow the IChatEventPublisher/ICallbackEventPublisher pattern — interface in Application, impl in Infrastructure (registered GCP-gated), optional injection with null safety.
