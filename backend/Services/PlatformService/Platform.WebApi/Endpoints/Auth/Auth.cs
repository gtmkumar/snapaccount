using AuthService.Application.Admin.Queries.GetAuditEvents;
using AuthService.Application.Auth.Commands.RefreshContext;
using AuthService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.Shared.Domain;
using AuthService.Application.Admin.Queries.GetStaffList;
using AuthService.Application.Navigation.Queries.GetMyMenu;
using AuthService.Application.Admin.Queries.GetTeamMembers;
using AuthService.Application.Admin.Queries.GetUserDetail;
using AuthService.Application.Admin.Queries.ListUsers;
using AuthService.Application.Auth.Commands.PasswordAuth;
using AuthService.Application.Auth.Commands.SocialFirebaseAuth;
using AuthService.Application.Otp.Commands.SendOtp;
using AuthService.Application.Otp.Commands.VerifyOtp;
using AuthService.Application.Preferences.Commands.UpdatePreferences;
using AuthService.Application.Preferences.Queries.GetPreferences;
using AuthService.Application.RefreshTokens.Commands.RefreshToken;
using AuthService.Application.Users.Commands.RequestAccountDeletion;
using AuthService.Application.Users.Commands.UpdateUserProfile;
using AuthService.Application.Users.Queries.GetCurrentUser;
using AuthService.Application.Devices.Commands.AddDevice;
using AuthService.Application.Devices.Commands.ApproveDevice;
using AuthService.Application.Devices.Commands.DenyDevice;
using AuthService.Application.Devices.Commands.RemoveDevice;
using AuthService.Application.Devices.Queries.GetMyApprovalStatus;
using AuthService.Application.Devices.Queries.GetPendingApproval;
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
        // POST /auth/social/firebase — Google / Apple social sign-in exchange.
        // Anonymous (this endpoint ESTABLISHES auth). Rate-limited like OTP to prevent abuse.
        groupBuilder.MapPost("/social/firebase", SocialFirebaseAuth).RequireRateLimiting("otp");

        // SEC-011: OTP endpoints rate-limited at 5 req / 10 min per client IP
        groupBuilder.MapPost("/otp/send", SendOtp).RequireRateLimiting("otp");
        groupBuilder.MapPost("/otp/verify", VerifyOtp).RequireRateLimiting("otp");

        // Phone-number + password auth (no SMS). Anonymous; rate-limited like OTP.
        groupBuilder.MapPost("/password/register", RegisterWithPassword).RequireRateLimiting("otp");
        groupBuilder.MapPost("/password/login", LoginWithPassword).RequireRateLimiting("otp");

        // GET /auth/methods — which login methods the client should offer. Anonymous.
        // When SMS or WhatsApp OTP is enabled, clients HIDE the password option
        // (password is an optional fallback, used only when no OTP channel exists).
        // Auto-detects SMS from the MSG91 key; explicit Auth:Methods:* overrides.
        groupBuilder.MapGet("/methods", static (IConfiguration config) =>
        {
            var smsConfigured = !string.IsNullOrWhiteSpace(config["Msg91:OtpAuthKey"])
                                || !string.IsNullOrWhiteSpace(config["Msg91:ApiKey"]);
            var otp = config.GetValue<bool?>("Auth:Methods:Otp") ?? smsConfigured;
            var whatsapp = config.GetValue<bool?>("Auth:Methods:WhatsApp") ?? false;
            var password = config.GetValue<bool?>("Auth:Methods:Password") ?? true;
            return Results.Ok(new AuthMethodsResponse(otp, whatsapp, password));
        });

        groupBuilder.MapPost("/token/refresh", RefreshToken);

        // POST /auth/token/refresh-context [Authorize]
        // GAP-007 / BUG-5: Re-issues the session JWT with current RBAC + org claims after
        // the onboarding wizard creates the organisation. Mobile calls this immediately after
        // POST /auth/organizations so subsequent calls carry the new OrganizationId claim.
        // ORG-SWITCHER (mobile Wave 6): accepts optional { organizationId } body; validates
        // active membership before minting — non-member/deleted-member → 403.
        groupBuilder.MapPost("/token/refresh-context", RefreshContext)
            .RequireAuthorization()
            .WithName("RefreshContextToken")
            .WithSummary("Re-issue session JWT with current org/RBAC claims after org creation or org switch")
            .WithDescription(
                "GAP-007/BUG-5: Called by mobile immediately after onboarding org creation. " +
                "ORG-SWITCHER: optional body { organizationId } selects which org's claims to mint. " +
                "Membership validated before token is issued — non-member returns 403. " +
                "Returns a fresh access token + echo of the effective organizationId. " +
                "Does NOT rotate the opaque refresh token. Rate-limited: standard 100 req/min.")
            .RequireRateLimiting("standard");

        // LOCAL_AUTH dev login (username/password against local DB). Anonymous.
        // Returns 404 when LOCAL_AUTH is disabled (ILocalAuthService not registered).
        groupBuilder.MapPost("/local/login", static async (
            LocalLoginRequest req, IServiceProvider sp, CancellationToken ct) =>
        {
            var localAuth = sp.GetService<ILocalAuthService>();
            if (localAuth is null)
                return Results.NotFound(new { error = "Local auth is disabled." });
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "Email and password are required." });

            var result = await localAuth.LoginAsync(req.Email, req.Password, ct);
            return result is null
                ? Results.Json(new { error = "Invalid email or password." }, statusCode: 401)
                : Results.Ok(result);
        });

        groupBuilder.MapGet("/me", GetMe).RequireAuthorization();
        // Phase 6F: role-based shell needs full permission list for client-side gating
        groupBuilder.MapGet("/me/permissions", GetPermissions).RequireAuthorization();
        // Backend-driven navigation: the permission-filtered menu tree for this user
        groupBuilder.MapGet("/me/menu", static async (ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetMyMenuQuery(), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        }).RequireAuthorization();

        // GET /auth/me/preferences — current preferences (defaults when no row exists yet)
        groupBuilder.MapGet("/me/preferences", GetPreferences).RequireAuthorization();
        // PATCH /auth/me/preferences — partial update; null fields = keep existing value
        groupBuilder.MapMethods("/me/preferences", ["PATCH"], PatchPreferences).RequireAuthorization();

        groupBuilder.MapPut("/profile", UpdateProfile).RequireAuthorization();
        groupBuilder.MapGet("/devices", GetDevices).RequireAuthorization();
        groupBuilder.MapDelete("/devices/{deviceId:guid}", RemoveDevice).RequireAuthorization();

        // ── GAP-047: Device approval endpoints ────────────────────────────────

        // GET /auth/devices/pending-approvals — list active approval requests for the caller
        groupBuilder.MapGet("/devices/pending-approvals", GetPendingApprovals)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetPendingDeviceApprovals")
            .WithSummary("List pending new-device approval requests for the authenticated user (GAP-047).")
            .WithDescription(
                "Mobile polls this after receiving a push notification to render the approve/deny screen. " +
                "Returns only active (non-expired, non-resolved) requests. Soft-launch: " +
                "DeviceApproval:Enforce=false (default) means existing sessions are not blocked.");

        // POST /auth/devices/{approvalId}/approve — approve from an existing device
        groupBuilder.MapPost("/devices/{approvalId:guid}/approve", ApproveDevice)
            .RequireAuthorization()
            .RequireRateLimiting("otp") // rate-limit like OTP — security-sensitive
            .WithName("ApproveDeviceRequest")
            .WithSummary("Approve a pending new-device login from an existing device (GAP-047).")
            .WithDescription(
                "Body: { reviewingDeviceEntityId: UUID }. " +
                "The reviewing device must be registered to the caller's account and must differ " +
                "from the device being approved. Returns 409 if expired or already resolved. " +
                "Returns 403 if the reviewing device is not registered to this account.");

        // POST /auth/devices/{approvalId}/deny — deny from an existing device
        groupBuilder.MapPost("/devices/{approvalId:guid}/deny", DenyDevice)
            .RequireAuthorization()
            .RequireRateLimiting("otp")
            .WithName("DenyDeviceRequest")
            .WithSummary("Deny a pending new-device login from an existing device (GAP-047).")
            .WithDescription(
                "Body: { reviewingDeviceEntityId: UUID, reason?: string }. " +
                "Enforce=true: deactivates new device + revokes its refresh token. " +
                "Enforce=false (default): records denial + logs only (soft-launch).");

        // GET /auth/devices/my-approval-status — NEW device's waiting-screen poll endpoint
        // GAP-047 mobile residual: the new device polls this instead of inferring approval
        // from session disappearance. Returns status + decidedAt + mode (ENFORCE/NOTIFY_ONLY).
        groupBuilder.MapGet("/devices/my-approval-status", GetMyApprovalStatus)
            .RequireAuthorization()
            .RequireRateLimiting("standard")
            .WithName("GetMyDeviceApprovalStatus")
            .WithSummary("NEW device polls its own approval status (PENDING/APPROVED/DENIED/EXPIRED) — GAP-047 mobile residual.")
            .WithDescription(
                "Authenticated as the pending device's own session JWT. " +
                "Returns: { approvalRequestId, status, decidedAt, expiresAt, mode }. " +
                "mode: ENFORCE — denial will have revoked the session; NOTIFY_ONLY — soft-launch, session remains valid. " +
                "The waiting screen should stop polling once status != PENDING. " +
                "Deferred items (out of scope, product-gated): approximate-location field, resend-push action.");
        groupBuilder.MapGet("/organizations", GetOrganizations).RequireAuthorization();
        groupBuilder.MapPost("/organizations", CreateOrganization).RequireAuthorization();
        // DPDP Act 2023: Right to Erasure
        groupBuilder.MapDelete("/account", DeleteAccount).RequireAuthorization();

        // GET /auth/admin/team-members?role= — operational team list for admin widgets
        // (?role=CA used by the GST filing-queue assign-to dropdown)
        // WEB-09/WEB-11 FIX: use ToHttpResult() so Forbidden → 403 (not 500 via Problem).
        groupBuilder.MapGet("/admin/team-members", static async (string? role, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetTeamMembersQuery(role), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        }).RequireAuthorization();

        // GET /auth/admin/staff?role= — SnapAccount internal-staff list (Team › Staff, Screen 87)
        // Richer than /admin/team-members: includes email, status, joined + last-active.
        // WEB-09/WEB-11 FIX: use ToHttpResult() so Forbidden → 403 (not 500 via Problem).
        groupBuilder.MapGet("/admin/staff", static async (string? role, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetStaffListQuery(role), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        }).RequireAuthorization();

        // GET /auth/admin/audit-events?limit=N&actorUserId= — cross-service audit tail
        groupBuilder.MapGet("/admin/audit-events", static async (
            int? limit, Guid? actorUserId, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetAuditEventsQuery(limit ?? 20, actorUserId), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        }).RequireAuthorization();

        // GET /auth/admin/users?page=&pageSize=&search=&isActive=&userType= — paginated CUSTOMER list
        // (excludes internal staff; userType filters BUSINESS_OWNER|EMPLOYEE within customers)
        // WEB-09 FIX: use ToHttpResult() so Forbidden → 403 (not 400 via BadRequest).
        groupBuilder.MapGet("/admin/users", static async (
            int? page, int? pageSize, string? search, bool? isActive, string? userType,
            ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(
                new ListUsersQuery(page ?? 1, pageSize ?? 20, search, isActive, userType), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
        }).RequireAuthorization();

        // GET /auth/admin/users/{id} — admin per-user detail (profile + business)
        // WEB-09 FIX: use ToHttpResult() for correct status code mapping including Forbidden → 403.
        groupBuilder.MapGet("/admin/users/{id:guid}", static async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetUserDetailQuery(id), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
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
    // POST /auth/otp/verify — SEC-011: rate limited to 5 req/10 min per client
    // DG-AUTH-02: forwards optional device metadata; handler registers the device inline
    // and returns DeviceApproval when a new DeviceApprovalRequest was created (GAP-047).
    private static async Task<IResult> VerifyOtp(VerifyOtpRequest req, ISender sender)
    {
        var result = await sender.Send(new VerifyOtpCommand(
            req.PhoneNumber,
            req.Otp,
            req.DeviceId,
            req.DeviceName,
            req.Platform,
            req.OsVersion,
            req.AppVersion,
            req.FcmToken));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code });
    }

    // POST /auth/password/register — create account with phone + password (no OTP)
    private static async Task<IResult> RegisterWithPassword(RegisterWithPasswordRequest req, ISender sender)
    {
        var result = await sender.Send(new RegisterWithPasswordCommand(req.PhoneNumber, req.Password, req.FullName));
        if (result.IsSuccess)
            return Results.Ok(result.Value);
        var status = result.Error.Type == ErrorType.Conflict ? 409 : 400;
        return Results.Json(new { error = result.Error.Message, code = result.Error.Code }, statusCode: status);
    }

    // POST /auth/password/login — log in with phone + password (no OTP)
    private static async Task<IResult> LoginWithPassword(LoginWithPasswordRequest req, ISender sender)
    {
        var result = await sender.Send(new LoginWithPasswordCommand(req.PhoneNumber, req.Password));
        if (result.IsSuccess)
            return Results.Ok(result.Value);
        var status = result.Error.Type == ErrorType.Unauthorized ? 401 : 400;
        return Results.Json(new { error = result.Error.Message, code = result.Error.Code }, statusCode: status);
    }

    // POST /auth/token/refresh
    private static async Task<IResult> RefreshToken(RefreshTokenRequest req, ISender sender)
    {
        var result = await sender.Send(new RefreshTokenCommand(req.Token));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.Unauthorized();
    }

    // POST /auth/token/refresh-context [Authorize]
    // GAP-007 / BUG-5: Re-issue session JWT with current org claims (no refresh token rotation).
    // ORG-SWITCHER (mobile Wave 6): optional { organizationId } body param selects a specific org.
    // Security: membership validated before token is minted — non-member → 403.
    // Board #42 FIX: NotFound (DEV_AUTH_BYPASS canned GUID with no auth.user row) → 401.
    // Previously fell through to Results.Problem → 500.
    private static async Task<IResult> RefreshContext(
        RefreshContextRequest req, ISender sender)
    {
        var result = await sender.Send(new RefreshContextCommand(req.OrganizationId));
        if (result.IsSuccess)
            return Results.Ok(result.Value);

        return result.Error.Type switch
        {
            // Board #42: user not found (e.g. DEV_AUTH_BYPASS canned GUID) → 401, not 500
            ErrorType.Unauthorized => Results.Unauthorized(),
            ErrorType.NotFound => Results.Json(
                new { error = "Session user not found. Please sign in again.", code = result.Error.Code },
                statusCode: 401),
            ErrorType.Forbidden => Results.Json(
                new { error = result.Error.Message, code = result.Error.Code },
                statusCode: 403),
            ErrorType.Validation => Results.Json(
                new { error = result.Error.Message, code = result.Error.Code },
                statusCode: 400),
            _ => Results.Json(
                new { error = result.Error.Message, code = result.Error.Code },
                statusCode: 400)
        };
    }

    // GET /auth/me [Authorize]
    private static async Task<IResult> GetMe(ISender sender)
    {
        var result = await sender.Send(new GetCurrentUserQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    // GET /auth/me/permissions [Authorize]
    // Returns effective permission codes (e.g. "org.members.invite") expanded from DB roles.
    // NOT role names — see GetUserPermissionsQuery for the full expansion logic.
    private static async Task<IResult> GetPermissions(ISender sender)
    {
        var result = await sender.Send(new GetUserPermissionsQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : Results.Unauthorized();
    }

    // PUT /auth/profile [Authorize]
    private static async Task<IResult> UpdateProfile(
        UpdateUserProfileRequest req, ISender sender)
    {
        var result = await sender.Send(new UpdateUserProfileCommand(
            req.FullName, req.Email, req.PanNumber, req.AadhaarLast4,
            req.DateOfBirth, req.Gender, req.AddressLine1, req.AddressLine2,
            req.City, req.State, req.Pincode, req.UserType));
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

    // ── GAP-047: Device approval handlers ────────────────────────────────────

    // GET /auth/devices/pending-approvals [Authorize]
    private static async Task<IResult> GetPendingApprovals(ISender sender)
    {
        var result = await sender.Send(new GetPendingApprovalsQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    // GET /auth/devices/my-approval-status [Authorize] — GAP-047 mobile residual
    private static async Task<IResult> GetMyApprovalStatus(ISender sender)
    {
        var result = await sender.Send(new GetMyApprovalStatusQuery());
        return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();
    }

    // POST /auth/devices/{approvalId}/approve [Authorize]
    private static async Task<IResult> ApproveDevice(
        Guid approvalId, ApproveDeviceRequest req, ISender sender)
    {
        var result = await sender.Send(new ApproveDeviceCommand(approvalId, req.ReviewingDeviceEntityId));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type switch
            {
                ErrorType.NotFound => Results.NotFound(new { error = result.Error.Message, code = result.Error.Code }),
                ErrorType.Forbidden => Results.Json(new { error = result.Error.Message, code = result.Error.Code }, statusCode: 403),
                ErrorType.Conflict => Results.Conflict(new { error = result.Error.Message, code = result.Error.Code }),
                _ => Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code })
            };
    }

    // POST /auth/devices/{approvalId}/deny [Authorize]
    private static async Task<IResult> DenyDevice(
        Guid approvalId, DenyDeviceRequest req, ISender sender)
    {
        var result = await sender.Send(new DenyDeviceCommand(approvalId, req.ReviewingDeviceEntityId, req.Reason));
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : result.Error.Type switch
            {
                ErrorType.NotFound => Results.NotFound(new { error = result.Error.Message, code = result.Error.Code }),
                ErrorType.Forbidden => Results.Json(new { error = result.Error.Message, code = result.Error.Code }, statusCode: 403),
                ErrorType.Conflict => Results.Conflict(new { error = result.Error.Message, code = result.Error.Code }),
                _ => Results.BadRequest(new { error = result.Error.Message, code = result.Error.Code })
            };
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

    // POST /auth/social/firebase [Anonymous] — Google/Apple social sign-in exchange
    private static async Task<IResult> SocialFirebaseAuth(
        SocialFirebaseAuthRequest req, ISender sender)
    {
        var result = await sender.Send(
            new SocialFirebaseAuthCommand(req.FirebaseIdToken, req.Provider, req.Email, req.DisplayName));
        if (result.IsSuccess)
            return Results.Ok(result.Value);
        var status = result.Error.Type == ErrorType.Unauthorized ? 401 : 400;
        return Results.Json(new { error = result.Error.Message, code = result.Error.Code }, statusCode: status);
    }

    // DELETE /auth/account [Authorize] — DPDP Act 2023 Right to Erasure
    private static async Task<IResult> DeleteAccount(ISender sender)
    {
        var result = await sender.Send(new RequestAccountDeletionCommand());
        return result.IsSuccess
            ? Results.NoContent()
            : Results.BadRequest(new { error = result.Error.Message });
    }

    // GET /auth/me/preferences [Authorize]
    // Returns current preferences; if no UserPreference row exists yet, returns defaults
    // (Theme=SYSTEM, language from user aggregate, all notifications enabled except WhatsApp).
    private static async Task<IResult> GetPreferences(ISender sender)
    {
        var result = await sender.Send(new GetPreferencesQuery());
        return result.IsSuccess
            ? Results.Ok(result.Value)
            : Results.NotFound(new { error = result.Error.Message });
    }

    // PATCH /auth/me/preferences [Authorize]
    // Partial update — any null field keeps its existing value.
    // Returns 204 No Content on success; 404 if the authenticated user does not exist.
    private static async Task<IResult> PatchPreferences(
        UpdatePreferencesRequest req, ISender sender)
    {
        var result = await sender.Send(new UpdatePreferencesCommand(
            req.PreferredLanguage,
            req.Theme,
            req.PushNotificationsEnabled,
            req.SmsNotificationsEnabled,
            req.EmailNotificationsEnabled,
            req.WhatsappNotificationsEnabled));

        return result.IsSuccess
            ? Results.NoContent()
            : result.Error.Type == ErrorType.NotFound
                ? Results.NotFound(new { error = result.Error.Message })
                : Results.BadRequest(new { error = result.Error.Message });
    }
}

// Request/Response DTOs (same as pre-refactor Program.cs record declarations)

/// <summary>
/// POST /auth/social/firebase request body.
/// <para>
/// <c>firebaseIdToken</c> — Firebase ID token from Google/Apple sign-in (client SDK).
/// <c>provider</c> — <c>"google"</c> or <c>"apple"</c>.
/// <c>email</c> — optional client hint; required when DEV_AUTH_BYPASS is active.
/// <c>displayName</c> — optional client hint used when creating a new user.
/// </para>
/// </summary>
internal record SocialFirebaseAuthRequest(
    string FirebaseIdToken,
    string Provider,
    string? Email = null,
    string? DisplayName = null);

internal record LocalLoginRequest(string Email, string Password);
internal record SendOtpRequest(string PhoneNumber);
/// <summary>
/// POST /auth/otp/verify request body.
/// DG-AUTH-02: Device metadata fields are optional. When <c>DeviceId</c> and <c>Platform</c>
/// are provided, the handler registers the device and returns a <c>deviceApproval</c> payload
/// in the response when the user already has ≥1 existing device (GAP-047).
/// </summary>
internal record VerifyOtpRequest(
    string PhoneNumber,
    string Otp,
    string? DeviceId = null,
    string? DeviceName = null,
    string? Platform = null,
    string? OsVersion = null,
    string? AppVersion = null,
    string? FcmToken = null);
internal record RegisterWithPasswordRequest(string PhoneNumber, string Password, string? FullName = null);
internal record LoginWithPasswordRequest(string PhoneNumber, string Password);
/// <summary>Enabled login methods the mobile/admin clients should surface.</summary>
public record AuthMethodsResponse(bool Otp, bool WhatsApp, bool Password);
internal record RefreshTokenRequest(string Token);

/// <summary>
/// POST /auth/token/refresh-context request body.
/// ORG-SWITCHER (mobile Wave 6): optional <c>organizationId</c> selects which org's claims
/// to embed in the new session JWT. When omitted, the handler uses the most-recently-created
/// active membership (existing behaviour, backward-compatible).
///
/// Security note: the handler validates active membership before minting any token.
/// A non-member or soft-deleted member receives 403.
/// </summary>
internal record RefreshContextRequest(Guid? OrganizationId = null);
internal record UpdateUserProfileRequest(
    string? FullName, string? Email, string? PanNumber, string? AadhaarLast4,
    DateOnly? DateOfBirth, string? Gender, string? AddressLine1, string? AddressLine2,
    string? City, string? State, string? Pincode, string? UserType = null);
internal record CreateOrganizationRequest(
    string BusinessName, string? Gstin, string? PanNumber,
    string? BusinessType, string? IndustryType, decimal? AnnualTurnoverInr);

/// <summary>
/// PATCH /auth/me/preferences request body. All fields are optional (nullable).
/// Omit a field (or pass null) to keep the current stored value.
/// <list type="bullet">
///   <item><term>PreferredLanguage</term><description>BCP-47 tag, e.g. "en", "hi", "ta".</description></item>
///   <item><term>Theme</term><description>One of "LIGHT", "DARK", "SYSTEM".</description></item>
/// </list>
/// </summary>
internal record UpdatePreferencesRequest(
    string? PreferredLanguage,
    string? Theme,
    bool? PushNotificationsEnabled,
    bool? SmsNotificationsEnabled,
    bool? EmailNotificationsEnabled,
    bool? WhatsappNotificationsEnabled);

/// <summary>
/// GAP-047: Request body for POST /auth/devices/{approvalId}/approve.
/// The reviewing device entity ID must differ from the device being approved.
/// </summary>
internal record ApproveDeviceRequest(Guid ReviewingDeviceEntityId);

/// <summary>GAP-047: Request body for POST /auth/devices/{approvalId}/deny.</summary>
internal record DenyDeviceRequest(Guid ReviewingDeviceEntityId, string? Reason = null);
