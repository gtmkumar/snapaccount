using MediatR;
using Microsoft.AspNetCore.OutputCaching;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Config.Commands.UpdateRazorpayConfig;
using SubscriptionService.Application.Plans.Commands.CreatePlan;
using SubscriptionService.Application.Plans.Commands.UpdatePlan;
using SubscriptionService.Application.Plans.Queries.ListPlans;
using SubscriptionService.Application.Subscriptions.Commands.CancelSubscription;
using SubscriptionService.Application.Subscriptions.Commands.DowngradeSubscription;
using SubscriptionService.Application.Subscriptions.Commands.GenerateInvoice;
using SubscriptionService.Application.Subscriptions.Commands.PauseSubscription;
using SubscriptionService.Application.Subscriptions.Commands.RecordPayment;
using SubscriptionService.Application.Subscriptions.Commands.RefundInvoice;
using SubscriptionService.Application.Subscriptions.Commands.ResumeSubscription;
using SubscriptionService.Application.Subscriptions.Commands.SelfServiceCancel;
using SubscriptionService.Application.Subscriptions.Commands.SelfServiceDowngrade;
using SubscriptionService.Application.Subscriptions.Commands.SelfServiceUpgrade;
using SubscriptionService.Application.Subscriptions.Commands.Subscribe;
using SubscriptionService.Application.Subscriptions.Commands.UpgradeSubscription;
using SubscriptionService.Application.Subscriptions.Commands.VoidInvoice;
using SubscriptionService.Application.Subscriptions.Queries.GetMrrDashboard;
using SubscriptionService.Application.Subscriptions.Queries.GetMrrHistory;
using SubscriptionService.Application.Subscriptions.Queries.GetProrationPreview;
using SubscriptionService.Application.Subscriptions.Queries.GetSubscription;
using SubscriptionService.Application.Subscriptions.Queries.ListInvoices;
using SubscriptionService.Application.Subscriptions.Queries.ListSubscriptionEvents;
using SubscriptionService.Application.Subscriptions.Queries.ListSubscribers;
using SubscriptionService.Domain.Enums;

namespace SubscriptionService.Api.Endpoints;

/// <summary>
/// All /subscriptions endpoints — plans, subscriptions, invoices, MRR dashboard.
/// Rate limit: standard (100 req/min). Zero 501s, zero TODOs.
/// </summary>
public sealed class Subscriptions : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/subscriptions";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        // ── Plans ───────────────────────────────────────────────────────────

        // GET /subscriptions/plans — list available plans
        // Output-cached: the plan catalog is global (no org/user scoping, no pipeline
        // [RequiresPermission] on ListPlansQuery); create/update below evict the tag.
        g.MapGet("/plans", ListPlans)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .CacheOutput(OutputCachingExtensions.MasterDataPolicyPrefix + "subscription-plans")
            .WithName("ListPlans")
            .WithSummary("List active subscription plans.");

        // POST /subscriptions/plans — create plan (admin; subscription.plan.create)
        g.MapPost("/plans", CreatePlan)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CreatePlan")
            .WithSummary("Create a new subscription plan. Requires subscription.plan.create permission.");

        // PUT /subscriptions/plans/{id} — update plan (admin; subscription.plan.update)
        g.MapPut("/plans/{id:guid}", UpdatePlan)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("UpdatePlan")
            .WithSummary("Update an existing plan. Requires subscription.plan.update permission.");

        // ── Subscriptions ────────────────────────────────────────────────────

        // GET /subscriptions/me — get active subscription for caller's org
        g.MapGet("/me", GetSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetSubscription")
            .WithSummary("Get the active subscription for the caller's organisation.");

        // POST /subscriptions — subscribe to a plan
        g.MapPost("/", Subscribe)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("Subscribe")
            .WithSummary("Subscribe the caller's organisation to a plan.");

        // POST /subscriptions/{id}/cancel — cancel subscription (admin; requires explicit id)
        g.MapPost("/{id:guid}/cancel", CancelSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CancelSubscription")
            .WithSummary("Cancel a subscription (admin route — requires explicit subscription id).");

        // POST /subscriptions/{id}/upgrade — upgrade to higher-tier plan (admin route)
        g.MapPost("/{id:guid}/upgrade", UpgradeSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("UpgradeSubscription")
            .WithSummary("Upgrade subscription to a higher-tier plan (admin route).");

        // POST /subscriptions/{id}/downgrade — downgrade to lower-tier plan (admin route)
        g.MapPost("/{id:guid}/downgrade", DowngradeSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("DowngradeSubscription")
            .WithSummary("Downgrade subscription to a lower-tier plan (admin route).");

        // ── DG-SUB-11: Admin pause / resume actions ──────────────────────────

        // POST /subscriptions/{id}/pause — pause an active/trialing subscription (admin)
        g.MapPost("/{id:guid}/pause", PauseSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("PauseSubscription")
            .WithSummary("DG-SUB-11: Pause an active subscription (admin). Requires subscription.manage permission.");

        // POST /subscriptions/{id}/resume — resume a paused subscription (admin)
        g.MapPost("/{id:guid}/resume", ResumeSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ResumeSubscription")
            .WithSummary("DG-SUB-11: Resume a paused subscription (admin). Requires subscription.manage permission.");

        // ── Self-service /me/* routes (DG-SUB-04) ────────────────────────────
        // Subscription id resolved server-side from ICurrentUser.OrganizationId.
        // These are what the admin frontend subscriptionApi.ts calls.

        // GET /subscriptions/me/proration-preview?newPlanId= — DG-SUB-08 proration preview
        g.MapGet("/me/proration-preview", GetProrationPreview)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetProrationPreview")
            .WithSummary("DG-SUB-08: Returns a mid-cycle proration preview for upgrading/downgrading the current plan.");

        // DELETE /subscriptions/me — self-service cancel (subscription resolved from caller's org)
        g.MapDelete("/me", SelfServiceCancel)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("SelfServiceCancelSubscription")
            .WithSummary("DG-SUB-04: Self-service cancel — resolves subscription from caller's organisation.");

        // POST /subscriptions/me/upgrade — self-service upgrade
        g.MapPost("/me/upgrade", SelfServiceUpgrade)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("SelfServiceUpgradeSubscription")
            .WithSummary("DG-SUB-04: Self-service upgrade — resolves subscription from caller's organisation.");

        // POST /subscriptions/me/downgrade — self-service downgrade
        g.MapPost("/me/downgrade", SelfServiceDowngrade)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("SelfServiceDowngradeSubscription")
            .WithSummary("DG-SUB-04: Self-service downgrade — resolves subscription from caller's organisation.");

        // ── Invoices ─────────────────────────────────────────────────────────

        // GET /subscriptions/invoices — list invoices for caller's org
        g.MapGet("/invoices", ListInvoices)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListInvoices")
            .WithSummary("List invoices for the caller's organisation (paginated).");

        // POST /subscriptions/{id}/invoices — generate invoice for a subscription
        g.MapPost("/{id:guid}/invoices", GenerateInvoice)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GenerateInvoice")
            .WithSummary("Generate a pending invoice for a subscription.");

        // POST /subscriptions/{id}/payments — record a payment (webhook-driven)
        g.MapPost("/{id:guid}/payments", RecordPayment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RecordPayment")
            .WithSummary("Record a successful Razorpay payment and renew the subscription.");

        // DG-SUB-11: Admin invoice actions (refund / void)

        // POST /subscriptions/invoices/{invoiceId}/refund — refund a paid invoice
        g.MapPost("/invoices/{invoiceId:guid}/refund", RefundInvoice)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RefundInvoice")
            .WithSummary("DG-SUB-11: Refund a PAID invoice (admin). Requires subscription.manage permission.");

        // POST /subscriptions/invoices/{invoiceId}/void — void a pending/failed invoice
        g.MapPost("/invoices/{invoiceId:guid}/void", VoidInvoice)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("VoidInvoice")
            .WithSummary("DG-SUB-11: Void a PENDING or FAILED invoice (admin). Requires subscription.manage permission.");

        // ── Admin ────────────────────────────────────────────────────────────

        // GET /subscriptions/mrr — MRR dashboard (subscription.plan.create permission)
        g.MapGet("/mrr", GetMrr)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetMrrDashboard")
            .WithSummary("MRR dashboard. Requires subscription.plan.create permission.");

        // DG-SUB-10: GET /subscriptions/mrr/history?months=12 — monthly MRR time-series for trend chart
        g.MapGet("/mrr/history", GetMrrHistory)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetMrrHistory")
            .WithSummary("DG-SUB-10: Monthly MRR time-series (up to 24 months). " +
                         "Returns [{month, totalMrr, activeCount}]. Requires subscription.plan.create permission.");

        // DG-SUB-10: GET /subscriptions/events?limit=20 — recent subscription lifecycle events feed
        g.MapGet("/events", ListSubscriptionEvents)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListSubscriptionEvents")
            .WithSummary("DG-SUB-10: Recent subscription lifecycle events feed (Subscribed, Cancelled, Paid, etc.). " +
                         "Requires subscription.plan.create permission.");

        // GET /subscriptions/admin/list — platform-admin subscriber list (paginated)
        // GAP-036: admin subscriber management page (SubscriberListPage.tsx)
        g.MapGet("/admin/list", ListSubscribers)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListSubscribers")
            .WithSummary("Platform-admin paginated subscriber list with plan tier, status, MRR, renewal date. " +
                         "Requires subscription.plan.create permission.");

        // GAP-034: PATCH /subscriptions/config/razorpay — admin-configured Razorpay credentials
        g.MapMethods("/config/razorpay", ["PATCH"], PatchRazorpayConfig)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("PatchRazorpayConfig")
            .WithSummary("Update Razorpay API credentials. Requires subscription.config.write permission.");
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    // BINDING-FIX: includeInactive was a required bool causing 500 when not supplied.
    // Default false — public listing shows only active plans; admins opt-in with ?includeInactive=true.
    private static async Task<IResult> ListPlans(
        ISender sender, CancellationToken ct, bool includeInactive = false)
    {
        var result = await sender.Send(new ListPlansQuery(includeInactive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> CreatePlan(
        CreatePlanRequest req, ISender sender, IOutputCacheStore cacheStore,
        ILogger<Subscriptions> logger, CancellationToken ct)
    {
        var result = await sender.Send(
            new CreatePlanCommand(req.Name, req.Tier, req.BillingCycle, req.PriceInr, req.TrialDays, req.Description), ct);
        if (result.IsSuccess)
        {
            await cacheStore.EvictMasterDataAsync("subscription-plans", logger, ct);
            return Results.Created($"/subscriptions/plans/{result.Value.PlanId}", result.Value);
        }
        return MapError(result.Error);
    }

    private static async Task<IResult> UpdatePlan(
        Guid id, UpdatePlanRequest req, ISender sender, IOutputCacheStore cacheStore,
        ILogger<Subscriptions> logger, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdatePlanCommand(id, req.Name, req.PriceInr, req.Description, req.IsActive), ct);
        if (result.IsSuccess)
        {
            await cacheStore.EvictMasterDataAsync("subscription-plans", logger, ct);
            return Results.NoContent();
        }
        return MapError(result.Error);
    }

    /// <summary>
    /// CONTRACT: returns 200+body when an active subscription exists;
    /// 404 (typed error body) when the org has no subscription yet.
    /// Clients must treat 404 as "no subscription / free tier" — NOT as an error.
    /// Mobile client: already handles 404 → null (see mobile/src/api/subscriptions.ts).
    /// Admin client: should catch 404 and treat as no-subscription state.
    /// </summary>
    private static async Task<IResult> GetSubscription(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetSubscriptionQuery(), ct);
        if (!result.IsSuccess)
            return MapError(result.Error);

        return result.Value is not null
            ? Results.Ok(result.Value)
            : Results.NotFound(new
            {
                code = "Subscription.NotFound",
                message = "This organisation has no active subscription."
            });
    }

    private static async Task<IResult> Subscribe(
        SubscribeRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new SubscribeCommand(req.PlanId, req.RazorpaySubscriptionId, req.RazorpayCustomerId), ct);
        return result.IsSuccess
            ? Results.Created($"/subscriptions/{result.Value.SubscriptionId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> CancelSubscription(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CancelSubscriptionCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── DG-SUB-04: Self-service /me/* handlers ────────────────────────────────

    private static async Task<IResult> SelfServiceCancel(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new SelfServiceCancelSubscriptionCommand(), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> SelfServiceUpgrade(
        SelfServiceUpgradeRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new SelfServiceUpgradeSubscriptionCommand(req.NewPlanId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> SelfServiceDowngrade(
        SelfServiceDowngradeRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new SelfServiceDowngradeSubscriptionCommand(req.NewPlanId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── DG-SUB-11: Pause / Resume handlers ────────────────────────────────────

    private static async Task<IResult> PauseSubscription(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new PauseSubscriptionCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> ResumeSubscription(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ResumeSubscriptionCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── DG-SUB-08: Proration preview handler ──────────────────────────────────

    private static async Task<IResult> GetProrationPreview(
        Guid newPlanId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetProrationPreviewQuery(newPlanId), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> UpgradeSubscription(
        Guid id, UpgradeRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new UpgradeSubscriptionCommand(id, req.NewPlanId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> DowngradeSubscription(
        Guid id, DowngradeRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DowngradeSubscriptionCommand(id, req.NewPlanId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> ListInvoices(
        [AsParameters] PageParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListInvoicesQuery(p.Page, p.PageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> GenerateInvoice(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GenerateInvoiceCommand(id), ct);
        return result.IsSuccess
            ? Results.Created($"/subscriptions/{id}/invoices/{result.Value.InvoiceId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> RecordPayment(
        Guid id, RecordPaymentRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new RecordPaymentCommand(id, req.RazorpayPaymentId, req.InvoiceNumber, req.AmountInr, req.NewPeriodEnd), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // ── DG-SUB-11: Refund / void invoice handlers ─────────────────────────────

    private static async Task<IResult> RefundInvoice(
        Guid invoiceId, RefundInvoiceRequest? req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new RefundInvoiceCommand(invoiceId, req?.RefundReason), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> VoidInvoice(
        Guid invoiceId, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new VoidInvoiceCommand(invoiceId), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> GetMrr(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetMrrDashboardQuery(), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // DG-SUB-10: Monthly MRR history for trend chart.
    private static async Task<IResult> GetMrrHistory(
        ISender sender, CancellationToken ct, int months = 12)
    {
        var result = await sender.Send(new GetMrrHistoryQuery(months), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // DG-SUB-10: Recent subscription lifecycle events feed.
    private static async Task<IResult> ListSubscriptionEvents(
        ISender sender, CancellationToken ct, int limit = 20)
    {
        var result = await sender.Send(new ListSubscriptionEventsQuery(limit), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> ListSubscribers(
        [AsParameters] SubscriberListParams p, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new ListSubscribersQuery(p.Page, p.PageSize, p.Status, p.Tier), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> PatchRazorpayConfig(
        PatchRazorpayConfigRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdateRazorpayConfigCommand(
                req.KeyId,
                req.KeySecret,
                req.WebhookSecret,
                req.TestMode,
                req.IsEnabled), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static IResult MapError(Error error)
        => error.Type switch
        {
            ErrorType.NotFound => Results.NotFound(new { error.Code, error.Message }),
            ErrorType.Validation => Results.UnprocessableEntity(new { error.Code, error.Message }),
            ErrorType.Conflict => Results.Conflict(new { error.Code, error.Message }),
            ErrorType.Forbidden => Results.Forbid(),
            ErrorType.Unauthorized => Results.Unauthorized(),
            _ => Results.Problem(error.Message, statusCode: 500)
        };
}

// ── Request / param types ──────────────────────────────────────────────────

internal record CreatePlanRequest(
    string Name,
    PlanTier Tier,
    BillingCycle BillingCycle,
    decimal PriceInr,
    int TrialDays = 0,
    string? Description = null);

internal record UpdatePlanRequest(
    string Name,
    decimal PriceInr,
    string? Description,
    bool IsActive);

internal record SubscribeRequest(
    Guid PlanId,
    string? RazorpaySubscriptionId = null,
    string? RazorpayCustomerId = null);

internal record UpgradeRequest(Guid NewPlanId);
internal record DowngradeRequest(Guid NewPlanId);

// DG-SUB-04: Self-service /me/* request bodies — subscription id resolved server-side.
internal record SelfServiceUpgradeRequest(Guid NewPlanId);
internal record SelfServiceDowngradeRequest(Guid NewPlanId);
internal record PatchRazorpayConfigRequest(
    string KeyId,
    string KeySecret,
    string? WebhookSecret,
    bool TestMode = true,
    bool IsEnabled = false);

internal record RecordPaymentRequest(
    string RazorpayPaymentId,
    string InvoiceNumber,
    decimal AmountInr,
    DateTime NewPeriodEnd);

/// <summary>DG-SUB-11: Optional body for POST /subscriptions/invoices/{id}/refund.</summary>
internal record RefundInvoiceRequest(string? RefundReason = null);

internal record PageParams(int Page = 1, int PageSize = 20);

/// <summary>Query parameters for GET /subscriptions/admin/list.</summary>
internal record SubscriberListParams(
    int Page = 1,
    int PageSize = 25,
    string? Status = null,
    string? Tier = null);
