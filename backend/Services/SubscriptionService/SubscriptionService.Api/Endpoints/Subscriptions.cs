using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Config.Commands.UpdateRazorpayConfig;
using SubscriptionService.Application.Plans.Commands.CreatePlan;
using SubscriptionService.Application.Plans.Commands.UpdatePlan;
using SubscriptionService.Application.Plans.Queries.ListPlans;
using SubscriptionService.Application.Subscriptions.Commands.CancelSubscription;
using SubscriptionService.Application.Subscriptions.Commands.DowngradeSubscription;
using SubscriptionService.Application.Subscriptions.Commands.GenerateInvoice;
using SubscriptionService.Application.Subscriptions.Commands.RecordPayment;
using SubscriptionService.Application.Subscriptions.Commands.Subscribe;
using SubscriptionService.Application.Subscriptions.Commands.UpgradeSubscription;
using SubscriptionService.Application.Subscriptions.Queries.GetMrrDashboard;
using SubscriptionService.Application.Subscriptions.Queries.GetSubscription;
using SubscriptionService.Application.Subscriptions.Queries.ListInvoices;
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
        g.MapGet("/plans", ListPlans)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
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

        // POST /subscriptions/{id}/cancel — cancel subscription
        g.MapPost("/{id:guid}/cancel", CancelSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CancelSubscription")
            .WithSummary("Cancel a subscription.");

        // POST /subscriptions/{id}/upgrade — upgrade to higher-tier plan
        g.MapPost("/{id:guid}/upgrade", UpgradeSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("UpgradeSubscription")
            .WithSummary("Upgrade subscription to a higher-tier plan.");

        // POST /subscriptions/{id}/downgrade — downgrade to lower-tier plan
        g.MapPost("/{id:guid}/downgrade", DowngradeSubscription)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("DowngradeSubscription")
            .WithSummary("Downgrade subscription to a lower-tier plan.");

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

        // ── Admin ────────────────────────────────────────────────────────────

        // GET /subscriptions/mrr — MRR dashboard (subscription.plan.create permission)
        g.MapGet("/mrr", GetMrr)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetMrrDashboard")
            .WithSummary("MRR dashboard. Requires subscription.plan.create permission.");

        // GAP-034: PATCH /subscriptions/config/razorpay — admin-configured Razorpay credentials
        g.MapMethods("/config/razorpay", ["PATCH"], PatchRazorpayConfig)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("PatchRazorpayConfig")
            .WithSummary("Update Razorpay API credentials. Requires subscription.config.write permission.");
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    private static async Task<IResult> ListPlans(
        bool includeInactive, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListPlansQuery(includeInactive), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    private static async Task<IResult> CreatePlan(
        CreatePlanRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new CreatePlanCommand(req.Name, req.Tier, req.BillingCycle, req.PriceInr, req.TrialDays, req.Description), ct);
        return result.IsSuccess
            ? Results.Created($"/subscriptions/plans/{result.Value.PlanId}", result.Value)
            : MapError(result.Error);
    }

    private static async Task<IResult> UpdatePlan(
        Guid id, UpdatePlanRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdatePlanCommand(id, req.Name, req.PriceInr, req.Description, req.IsActive), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static async Task<IResult> GetSubscription(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetSubscriptionQuery(), ct);
        return result.IsSuccess
            ? result.Value != null ? Results.Ok(result.Value) : Results.NotFound()
            : MapError(result.Error);
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

    private static async Task<IResult> GetMrr(ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetMrrDashboardQuery(), ct);
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

internal record PageParams(int Page = 1, int PageSize = 20);
