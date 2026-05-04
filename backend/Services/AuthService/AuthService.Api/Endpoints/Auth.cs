using AuthService.Application.Admin.Queries.GetAuditEvents;
using AuthService.Application.Admin.Queries.GetTeamMembers;
using AuthService.Application.Otp.Commands.SendOtp;
using AuthService.Application.Otp.Commands.VerifyOtp;
using AuthService.Application.RefreshTokens.Commands.RefreshToken;
using AuthService.Application.Users.Commands.RequestAccountDeletion;
using AuthService.Application.Users.Commands.UpdateUserProfile;
using AuthService.Application.Users.Queries.GetCurrentUser;
using AuthService.Application.Devices.Commands.AddDevice;
using AuthService.Application.Devices.Commands.RemoveDevice;
using AuthService.Application.Devices.Queries.GetUserDevices;
using AuthService.Application.Organizations.Commands.CreateOrganization;
using AuthService.Application.Organizations.Queries.GetOrganizations;
using AuthService.Application.Users.Queries.GetUserPermissions;
using MediatR;
using SnapAccount.Shared.Api;

namespace AuthService.Api.Endpoints;

/// <summary>
/// All /auth endpoints — OTP, token refresh, user profile, devices, organizations.
/// Inherits <see cref="EndpointGroupBase"/>; discovered automatically by
/// <see cref="WebApplicationExtensions.MapEndpoints"/>.
/// </summary>
public sealed class Auth : EndpointGroupBase
{
    /// <summary>Route prefix: /auth (absolute path, not /api/Auth).</summary>
    public override string? GroupName => "/auth";

    /// <inheritdoc />
    public override void Map(RouteGroupBuilder groupBuilder)
    {
        // SEC-011: OTP endpoints rate-limited at 5 req / 10 min per client IP
        groupBuilder.MapPost("/otp/send", SendOtp).RequireRateLimiting("otp");
        groupBuilder.MapPost("/otp/verify", VerifyOtp).RequireRateLimiting("otp");
        groupBuilder.MapPost("/token/refresh", RefreshToken);
        groupBuilder.MapGet("/me", GetMe).RequireAuthorization();
        // Phase 6F: role-based shell needs full permission list for client-side gating
        groupBuilder.MapGet("/me/permissions", GetPermissions).RequireAuthorization();
        groupBuilder.MapPut("/profile", UpdateProfile).RequireAuthorization();
        groupBuilder.MapGet("/devices", GetDevices).RequireAuthorization();
        groupBuilder.MapDelete("/devices/{deviceId:guid}", RemoveDevice).RequireAuthorization();
        groupBuilder.MapGet("/organizations", GetOrganizations).RequireAuthorization();
        groupBuilder.MapPost("/organizations", CreateOrganization).RequireAuthorization();
        // DPDP Act 2023: Right to Erasure
        groupBuilder.MapDelete("/account", DeleteAccount).RequireAuthorization();

        // GET /auth/admin/team-members — operational team list for the admin dashboard widget
        groupBuilder.MapGet("/admin/team-members", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetTeamMembersQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.Problem(result.Error.Message);
        }).RequireAuthorization();

        // GET /auth/admin/audit-events?limit=N — cross-service audit tail (reads shared.audit_log)
        groupBuilder.MapGet("/admin/audit-events", static async (int? limit, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetAuditEventsQuery(limit ?? 20), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(new { error = result.Error.Message });
        }).RequireAuthorization();
    }

    // POST /auth/otp/send — SEC-011: rate limited to 5 req/10 min per client
    private static async Task<IResult> SendOtp(
        SendOtpRequest req, ISender sender, HttpContext ctx)
    {
        var result = await sender.Send(new SendOtpCommand(
            req.PhoneNumber, "AUTH",
            ctx.Connection.RemoteIpAddress?.ToString(),
            ctx.Request.Headers.UserAgent));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // POST /auth/otp/verify — SEC-011: rate limited to 5 req/10 min per client
    private static async Task<IResult> VerifyOtp(VerifyOtpRequest req, ISender sender)
    {
        var result = await sender.Send(new VerifyOtpCommand(req.PhoneNumber, req.Otp, req.DeviceId));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // POST /auth/token/refresh
    private static async Task<IResult> RefreshToken(RefreshTokenRequest req, ISender sender)
    {
        var result = await sender.Send(new RefreshTokenCommand(req.Token));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Unauthorized();
    }

    // GET /auth/me [Authorize]
    private static async Task<IResult> GetMe(ISender sender)
    {
        var result = await sender.Send(new GetCurrentUserQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Unauthorized();
    }

    // GET /auth/me/permissions [Authorize]
    // Phase 6F: returns effective permissions for role-based shell + client-side gating.
    // Permission constants include all Phase 6F additions:
    //   chat.thread.assign, chat.thread.resolve, chat.thread.escalate,
    //   subscription.plan.create, subscription.plan.update,
    //   team.invite, team.role.assign
    private static async Task<IResult> GetPermissions(ISender sender)
    {
        var result = await sender.Send(new GetUserPermissionsQuery());
        return result.IsSuccess ? Results.Ok(new { permissions = result.Value }) : Results.Unauthorized();
    }

    // PUT /auth/profile [Authorize]
    private static async Task<IResult> UpdateProfile(
        UpdateUserProfileRequest req, ISender sender)
    {
        var result = await sender.Send(new UpdateUserProfileCommand(
            req.FullName, req.Email, req.PanNumber, req.AadhaarLast4,
            req.DateOfBirth, req.Gender, req.AddressLine1, req.AddressLine2,
            req.City, req.State, req.Pincode));
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message });
    }

    // GET /auth/devices [Authorize]
    private static async Task<IResult> GetDevices(ISender sender)
    {
        var result = await sender.Send(new GetUserDevicesQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Unauthorized();
    }

    // DELETE /auth/devices/{deviceId} [Authorize]
    private static async Task<IResult> RemoveDevice(Guid deviceId, ISender sender)
    {
        var result = await sender.Send(new RemoveDeviceCommand(deviceId));
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message });
    }

    // GET /auth/organizations [Authorize]
    private static async Task<IResult> GetOrganizations(ISender sender)
    {
        var result = await sender.Send(new GetOrganizationsQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Unauthorized();
    }

    // POST /auth/organizations [Authorize]
    private static async Task<IResult> CreateOrganization(
        CreateOrganizationRequest req, ISender sender)
    {
        var result = await sender.Send(new CreateOrganizationCommand(
            req.BusinessName, req.Gstin, req.PanNumber,
            req.BusinessType, req.IndustryType, req.AnnualTurnoverInr));
        return result.IsSuccess
            ? Results.Created($"/auth/organizations/{result.Value.OrganizationId}", result.Value)
            : Results.BadRequest(new { error = result.Error.Message });
    }

    // DELETE /auth/account [Authorize] — DPDP Act 2023 Right to Erasure
    private static async Task<IResult> DeleteAccount(ISender sender)
    {
        var result = await sender.Send(new RequestAccountDeletionCommand());
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message });
    }
}

// Request/Response DTOs (same as pre-refactor Program.cs record declarations)
internal record SendOtpRequest(string PhoneNumber);
internal record VerifyOtpRequest(string PhoneNumber, string Otp, string? DeviceId = null);
internal record RefreshTokenRequest(string Token);
internal record UpdateUserProfileRequest(
    string? FullName, string? Email, string? PanNumber, string? AadhaarLast4,
    DateOnly? DateOfBirth, string? Gender, string? AddressLine1, string? AddressLine2,
    string? City, string? State, string? Pincode);
internal record CreateOrganizationRequest(
    string BusinessName, string? Gstin, string? PanNumber,
    string? BusinessType, string? IndustryType, decimal? AnnualTurnoverInr);
