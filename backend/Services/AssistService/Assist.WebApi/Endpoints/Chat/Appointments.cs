using ChatService.Application.Appointments.Commands.BookAppointment;
using ChatService.Application.Appointments.Commands.CancelAppointment;
using ChatService.Application.Appointments.Commands.CancelByCa;
using ChatService.Application.Appointments.Commands.CompleteAppointment;
using ChatService.Application.Appointments.Commands.CreateAvailabilityRule;
using ChatService.Application.Appointments.Commands.CreateSlot;
using ChatService.Application.Appointments.Commands.DeleteAvailabilityRule;
using ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;
using ChatService.Application.Appointments.Commands.MarkNoShow;
using ChatService.Application.Appointments.Commands.RateAppointment;
using ChatService.Application.Appointments.Commands.RescheduleAppointment;
using ChatService.Application.Appointments.Commands.WriteCaSummary;
using ChatService.Application.Appointments.Queries.GetAppointment;
using ChatService.Application.Appointments.Queries.GetSlotDayMap;
using ChatService.Application.Appointments.Queries.ListAppointments;
using ChatService.Application.Appointments.Queries.ListAvailableSlots;
using ChatService.Application.Appointments.Queries.ListAvailabilityRules;
using ChatService.Application.Appointments.Queries.ListCaProfiles;
using ChatService.Application.Bookmarks.Commands.ToggleBookmark;
using ChatService.Application.Bookmarks.Queries.ListBookmarks;
using ChatService.Domain.Enums;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Application;

namespace ChatService.Api.Endpoints;

/// <summary>
/// Appointment (CA consultation) and message bookmark endpoints.
/// GAP-031: CA profiles, availability slots, booking/reschedule/cancel, ratings.
/// GAP-043: Message bookmarks (toggle + list).
/// Wave 7A addendum: CA profiles list, CA-initiated cancel, recurring availability rules CRUD + generation.
///
/// Rate limit: standard (100 req/min per user).
/// Booking expected latency: up to 3s (meeting link generation).
/// </summary>
public sealed class Appointments : EndpointGroupBase
{
    /// <inheritdoc />
    public override string? GroupName => "/appointments";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder g)
    {
        // ── CA profiles list (Wave 7A addendum) ───────────────────────────────

        /// <summary>GET /appointments/ca-profiles — list CA profiles (admin / booking UI).</summary>
        g.MapGet("/ca-profiles", ListCaProfiles)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListCaProfiles")
            .WithSummary("List CA profiles (active by default) for the booking UI. Replaces the team-members workaround.")
            .WithDescription("Requires chat.appointments.book permission. Paginated; default activeOnly=true.");

        // ── CA-initiated cancel (Wave 7A addendum) ────────────────────────────

        /// <summary>POST /appointments/{id}/cancel-by-ca — CA cancels with reason (no 2h rule).</summary>
        g.MapPost("/{id:guid}/cancel-by-ca", CancelByCa)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CancelAppointmentByCa")
            .WithSummary("CA-initiated cancellation — no 2h window restriction. Records reason + fires notification.")
            .WithDescription(
                "Requires chat.slots.manage. Distinct from user cancel: marks CancelledByCa=true, " +
                "fires AppointmentCancelledByCaEvent so NotificationService pushes an alert to the SME user.");

        // ── Recurring availability rules (Wave 7A addendum) ───────────────────

        /// <summary>POST /appointments/availability-rules — CA creates a recurring weekly rule.</summary>
        g.MapPost("/availability-rules", CreateAvailabilityRule)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CreateAvailabilityRule")
            .WithSummary("CA: create a recurring weekly availability rule (weekday + time window + slot duration).")
            .WithDescription("Requires chat.slots.manage. Slots are materialised by the weekly Hangfire job or via the generate endpoint.");

        /// <summary>GET /appointments/availability-rules — list availability rules for a CA.</summary>
        g.MapGet("/availability-rules", ListAvailabilityRules)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListAvailabilityRules")
            .WithSummary("List recurring availability rules. CA sees their own; admin can filter by caProfileId.")
            .WithDescription("Requires chat.slots.manage. Query params: caProfileId (optional), activeOnly (default true).");

        /// <summary>DELETE /appointments/availability-rules/{id} — soft-delete a rule.</summary>
        g.MapDelete("/availability-rules/{id:guid}", DeleteAvailabilityRule)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("DeleteAvailabilityRule")
            .WithSummary("Deactivate a recurring rule. Does NOT delete already-generated slots.")
            .WithDescription("Requires chat.slots.manage. CA may only delete their own rules (IDOR-scoped).");

        /// <summary>POST /appointments/availability-rules/{id}/generate — generate slots now for a rule's profile.</summary>
        g.MapPost("/availability-rules/generate", GenerateSlots)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GenerateSlotsFromRules")
            .WithSummary("On-demand: materialise AppointmentSlot rows from active rules for the next N weeks.")
            .WithDescription(
                "Requires chat.slots.manage. Idempotent — existing slots are skipped. " +
                "The weekly Hangfire job runs this automatically every Sunday at 01:00 IST. " +
                "Body: { caProfileId (optional), weeksAhead (1–52, default 4) }.");

        // ── Slot management (CA/staff tier) ───────────────────────────────────

        /// <summary>POST /appointments/slots — CA creates an availability slot.</summary>
        g.MapPost("/slots", CreateSlot)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CreateAppointmentSlot")
            .WithSummary("CA: create an availability slot for booking.")
            .WithDescription("Requires chat.slots.manage permission (CA/staff tier).");

        /// <summary>GET /appointments/slots — List available slots for a CA.</summary>
        g.MapGet("/slots", ListAvailableSlots)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListAvailableSlots")
            .WithSummary("List available slots for a CA profile, optionally filtered by date.");

        /// <summary>GET /appointments/slots/day-map — Per-day availability count for the DateStrip.</summary>
        g.MapGet("/slots/day-map", GetSlotDayMap)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetSlotDayMap")
            .WithSummary("Returns per-day available-slot counts for a CA, so the mobile DateStrip can grey out fully-booked days.")
            .WithDescription(
                "Query params: caProfileId (required), from (YYYY-MM-DD, required), to (YYYY-MM-DD, required, ≤90 days). " +
                "Returns {date, availableCount} for every day in [from, to] inclusive. " +
                "availableCount=0 means fully booked or no slots — DateStrip should grey out that day. " +
                "Only future available slots are counted (past slots and booked slots are excluded).");

        // ── Booking (org-member tier) ──────────────────────────────────────────

        /// <summary>POST /appointments — Book a slot with a CA.</summary>
        g.MapPost("/", BookAppointment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("BookAppointment")
            .WithSummary("Book an available CA slot — returns confirmed appointment with Meet link.")
            .WithDescription(
                "Requires chat.appointments.book permission. " +
                "Generates a Google Meet link (mock by default; GoogleCalendar when configured). " +
                "Raises AppointmentBookedEvent for 30min/5min reminder scheduling.");

        /// <summary>GET /appointments — List appointments for the current org.</summary>
        g.MapGet("/", ListAppointments)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListAppointments")
            .WithSummary("List appointments for the current organisation (paginated).");

        /// <summary>GET /appointments/{id} — Single appointment detail (IDOR-guarded by org).</summary>
        g.MapGet("/{id:guid}", GetAppointment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetAppointment")
            .WithSummary("Single appointment detail by id — superset of list-item DTO.")
            .WithDescription(
                "IDOR guard: appointment must belong to the caller's organisation. " +
                "Returns 404 when id is not found or belongs to another org. " +
                "Detail-only fields: Notes, Topic, RatingComment, RatedAt, CancelledByCa, CaCancellationReason.");

        /// <summary>POST /appointments/{id}/reschedule — Reschedule a confirmed appointment.</summary>
        g.MapPost("/{id:guid}/reschedule", RescheduleAppointment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RescheduleAppointment")
            .WithSummary("Reschedule a confirmed appointment to a new slot (≥2h before rule enforced).");

        /// <summary>POST /appointments/{id}/cancel — Cancel an appointment.</summary>
        g.MapPost("/{id:guid}/cancel", CancelAppointment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CancelAppointment")
            .WithSummary("Cancel an appointment (≥2h before slot start rule enforced).");

        /// <summary>POST /appointments/{id}/complete — CA marks an appointment completed.</summary>
        g.MapPost("/{id:guid}/complete", CompleteAppointment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("CompleteAppointment")
            .WithSummary("CA: mark a CONFIRMED appointment as COMPLETED. Unblocks the rating path.")
            .WithDescription(
                "DG-CHAT-02. Requires chat.slots.manage. IDOR-scoped to the CA's own appointments. " +
                "Also run automatically by the 'auto-complete-appointments' Hangfire job every 5 minutes " +
                "for appointments whose slot end time has passed.");

        /// <summary>POST /appointments/{id}/no-show — CA marks an appointment as no-show.</summary>
        g.MapPost("/{id:guid}/no-show", MarkNoShow)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("MarkNoShow")
            .WithSummary("CA: mark a CONFIRMED appointment as NO_SHOW when the user does not attend.")
            .WithDescription(
                "DG-CHAT-02. Requires chat.slots.manage. IDOR-scoped to the CA's own appointments. " +
                "Releases the slot back to available.");

        /// <summary>POST /appointments/{id}/rate — Rate a completed appointment.</summary>
        g.MapPost("/{id:guid}/rate", RateAppointment)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("RateAppointment")
            .WithSummary("Rate a completed appointment (1–5 stars). One rating per appointment; updates CA aggregate.");

        /// <summary>PUT /appointments/{id}/ca-summary — CA writes (or overwrites) a post-call summary note.</summary>
        g.MapPut("/{id:guid}/ca-summary", WriteCaSummary)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("WriteCaSummary")
            .WithSummary("CA: write a post-call summary note on a COMPLETED appointment (DG-CHAT-05).")
            .WithDescription(
                "Requires chat.slots.manage. IDOR-scoped to the CA's own appointments. " +
                "Only allowed when Status == COMPLETED. The note (max 4000 chars) is visible " +
                "to the user on the appointment detail screen (GET /appointments/{id}).");

        // ── Message bookmarks (GAP-043) ────────────────────────────────────────

        /// <summary>POST /appointments/bookmarks/toggle — Toggle bookmark on a message.</summary>
        g.MapPost("/bookmarks/toggle", ToggleBookmark)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ToggleMessageBookmark")
            .WithSummary("Toggle a bookmark on a chat message for the calling user.");

        /// <summary>GET /appointments/bookmarks — List bookmarked messages for the calling user.</summary>
        g.MapGet("/bookmarks", ListBookmarks)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("ListMessageBookmarks")
            .WithSummary("List all bookmarked messages for the calling user (paginated).");
    }

    // ── Delegates ──────────────────────────────────────────────────────────────

    // Wave 7A addendum delegates

    private static async Task<IResult> ListCaProfiles(
        ISender sender, CancellationToken ct,
        bool? activeOnly = null, int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(
            new ListCaProfilesQuery(activeOnly ?? true, page <= 0 ? 1 : page, pageSize <= 0 ? 20 : pageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> CancelByCa(Guid id, CancelByCaRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CancelByCaCommand(id, req.Reason), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> CreateAvailabilityRule(
        CreateAvailabilityRuleRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreateAvailabilityRuleCommand(
            req.Weekday, req.StartTimeIst, req.EndTimeIst, req.SlotDurationMinutes,
            req.EffectiveFrom, req.EffectiveTo), ct);
        return result.IsSuccess
            ? Results.Created($"/appointments/availability-rules/{result.Value!.RuleId}", result.Value)
            : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> ListAvailabilityRules(
        Guid? caProfileId, bool? activeOnly, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ListAvailabilityRulesQuery(caProfileId, activeOnly ?? true), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> DeleteAvailabilityRule(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeleteAvailabilityRuleCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> GenerateSlots(
        GenerateSlotsRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new GenerateSlotsFromRulesCommand(req.CaProfileId, req.WeeksAhead ?? 4), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> CreateSlot(CreateSlotRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CreateSlotCommand(req.StartUtc, req.EndUtc), ct);
        return result.IsSuccess
            ? Results.Created($"/appointments/slots/{result.Value!.SlotId}", result.Value)
            : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> ListAvailableSlots(
        ISender sender, CancellationToken ct,
        Guid? caProfileId = null, DateOnly? date = null)
    {
        // caProfileId is semantically required for this query — return 400 (not 500) when absent.
        if (!caProfileId.HasValue)
            return Results.BadRequest(new { error = "caProfileId query parameter is required.", code = "CHAT.MissingCaProfileId" });
        var result = await sender.Send(new ListAvailableSlotsQuery(caProfileId.Value, date), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> BookAppointment(BookAppointmentRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new BookAppointmentCommand(req.CaProfileId, req.SlotId, req.Notes, req.Topic), ct);
        return result.IsSuccess
            ? Results.Created($"/appointments/{result.Value!.AppointmentId}", result.Value)
            : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> GetAppointment(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new GetAppointmentQuery(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> GetSlotDayMap(
        ISender sender, CancellationToken ct,
        Guid? caProfileId = null, DateOnly? from = null, DateOnly? to = null)
    {
        // All three params are semantically required — return 400 (not 500) for each missing one.
        if (!caProfileId.HasValue)
            return Results.BadRequest(new { error = "caProfileId query parameter is required.", code = "CHAT.MissingCaProfileId" });
        if (!from.HasValue)
            return Results.BadRequest(new { error = "from query parameter (YYYY-MM-DD) is required.", code = "CHAT.MissingFrom" });
        if (!to.HasValue)
            return Results.BadRequest(new { error = "to query parameter (YYYY-MM-DD) is required.", code = "CHAT.MissingTo" });

        var result = await sender.Send(new GetSlotDayMapQuery(caProfileId.Value, from.Value, to.Value), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> ListAppointments(
        ISender sender, CancellationToken ct,
        AppointmentStatus? status = null, int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(new ListAppointmentsQuery(status, page <= 0 ? 1 : page, pageSize <= 0 ? 20 : pageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> RescheduleAppointment(
        Guid id, RescheduleAppointmentRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RescheduleAppointmentCommand(id, req.NewSlotId), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> CancelAppointment(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CancelAppointmentCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> CompleteAppointment(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new CompleteAppointmentCommand(id, SkipOwnerCheck: false), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> MarkNoShow(Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new MarkNoShowCommand(id), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> RateAppointment(
        Guid id, RateAppointmentRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new RateAppointmentCommand(id, req.Stars, req.Comment), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> WriteCaSummary(
        Guid id, WriteCaSummaryRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new WriteCaSummaryCommand(id, req.SummaryNote), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> ToggleBookmark(ToggleBookmarkRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new ToggleBookmarkCommand(req.MessageId, req.Note), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }

    private static async Task<IResult> ListBookmarks(
        ISender sender, CancellationToken ct,
        int page = 1, int pageSize = 20)
    {
        var result = await sender.Send(new ListBookmarksQuery(page <= 0 ? 1 : page, pageSize <= 0 ? 20 : pageSize), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToHttpResult();
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

/// <summary>Request body for creating an availability slot.</summary>
public record CreateSlotRequest(DateTime StartUtc, DateTime EndUtc);

/// <summary>
/// Request body for booking an appointment.
/// Migration 086: Topic is now a first-class field (max 50 chars).
/// Valid values: ACCOUNTING, GST, ITR, LOAN, OTHER.
/// </summary>
public record BookAppointmentRequest(Guid CaProfileId, Guid SlotId, string? Notes = null, string? Topic = null);

/// <summary>Request body for rescheduling an appointment.</summary>
public record RescheduleAppointmentRequest(Guid NewSlotId);

/// <summary>Request body for rating an appointment.</summary>
public record RateAppointmentRequest(int Stars, string? Comment = null);

/// <summary>Request body for toggling a message bookmark.</summary>
public record ToggleBookmarkRequest(Guid MessageId, string? Note = null);

/// <summary>
/// Request body for the CA writing a post-call summary note (DG-CHAT-05).
/// Max 4000 characters; validated by WriteCaSummaryCommandValidator.
/// </summary>
public record WriteCaSummaryRequest(string SummaryNote);

// ── Wave 7A addendum request DTOs ────────────────────────────────────────────

/// <summary>Request body for CA-initiated cancellation.</summary>
public record CancelByCaRequest(string Reason);

/// <summary>Request body for creating a recurring availability rule.</summary>
public record CreateAvailabilityRuleRequest(
    int Weekday,
    TimeSpan StartTimeIst,
    TimeSpan EndTimeIst,
    int SlotDurationMinutes,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo = null);

/// <summary>Request body for on-demand slot generation.</summary>
public record GenerateSlotsRequest(Guid? CaProfileId = null, int? WeeksAhead = null);
