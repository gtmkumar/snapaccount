using System.Security.Cryptography;
using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Otp.Commands.VerifyOtp;

/// <summary>Verifies the OTP sent to a phone number and issues a Firebase custom token.</summary>
/// <param name="PhoneNumber">Indian mobile number that received the OTP.</param>
/// <param name="Otp">6-digit OTP.</param>
/// <param name="DeviceId">Optional — device to associate with the session. When provided and the
/// user already has ≥1 registered device, a <see cref="DeviceApprovalInfo"/> is returned.</param>
/// <param name="DeviceName">Human-readable device label (e.g. "Pixel 7 Pro").</param>
/// <param name="Platform">ANDROID, IOS, or WEB. Required when DeviceId is provided.</param>
/// <param name="OsVersion">OS version string (optional, for display in approval push).</param>
/// <param name="AppVersion">App build version string (optional).</param>
/// <param name="FcmToken">FCM push token (optional — used to deliver the approval notification).</param>
public record VerifyOtpCommand(
    string PhoneNumber,
    string Otp,
    string? DeviceId = null,
    string? DeviceName = null,
    string? Platform = null,
    string? OsVersion = null,
    string? AppVersion = null,
    string? FcmToken = null)
    : ICommand<VerifyOtpResponse>;

/// <summary>
/// GAP-047 / DG-AUTH-02: Device approval state returned inline with the OTP-verify response.
/// When the user has ≥1 existing device and <c>Required</c> is true, the mobile should gate
/// entry until the waiting-screen poll resolves the approval.
/// </summary>
/// <param name="Required">True when a new DeviceApprovalRequest was created.</param>
/// <param name="RequestId">ID of the newly created DeviceApprovalRequest.</param>
/// <param name="Mode">
/// Soft-launch mode: <c>ENFORCE</c> — the mobile gate blocks until approved/denied/expired;
/// <c>NOTIFY_ONLY</c> — existing devices are notified but entry is not blocked.
/// </param>
public record DeviceApprovalInfo(bool Required, Guid RequestId, string Mode);

/// <summary>
/// Response returned after successful OTP verification.
/// <para><c>RefreshToken</c> is a 64-byte random opaque string (base64). Store it securely
/// (Expo SecureStore / Android Keystore) and exchange via POST /auth/token/refresh.
/// <c>RefreshExpiresAt</c> is UTC ISO-8601.</para>
/// <para>DG-AUTH-02: <c>DeviceApproval</c> is non-null when the verified device login
/// created a device approval request (user has ≥1 existing device + DeviceId was provided).</para>
/// </summary>
public record VerifyOtpResponse(
    bool IsNewUser,
    string? FirebaseCustomToken,
    Guid UserId,
    string? RefreshToken = null,
    DateTime? RefreshExpiresAt = null,
    DeviceApprovalInfo? DeviceApproval = null);

/// <summary>FluentValidation validator for <see cref="VerifyOtpCommand"/>.</summary>
public sealed class VerifyOtpCommandValidator : AbstractValidator<VerifyOtpCommand>
{
    public VerifyOtpCommandValidator()
    {
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^[6-9]\d{9}$")
            .WithMessage("Must be a valid Indian mobile number.");

        RuleFor(x => x.Otp)
            .NotEmpty()
            .Length(6).WithMessage("OTP must be exactly 6 digits.")
            .Matches(@"^\d{6}$").WithMessage("OTP must contain only digits.");

        // When a DeviceId is provided, Platform must also be specified and valid.
        When(x => !string.IsNullOrWhiteSpace(x.DeviceId), () =>
        {
            RuleFor(x => x.Platform)
                .NotEmpty().WithMessage("Platform is required when DeviceId is provided.")
                .Must(p => p is null or "ANDROID" or "IOS" or "WEB")
                .WithMessage("Platform must be ANDROID, IOS, or WEB.");
            RuleFor(x => x.DeviceId)
                .MaximumLength(256);
        });
    }
}

/// <summary>
/// Verifies the OTP (enforcing 3-attempt limit + 30-min lockout via <see cref="IOtpService"/>),
/// finds or creates the <see cref="User"/> aggregate, issues a Firebase custom token,
/// and persists an initial refresh token so clients can call /auth/token/refresh immediately.
///
/// DG-AUTH-02 / GAP-047: When <see cref="VerifyOtpCommand.DeviceId"/> is present the handler
/// registers the device via <see cref="User.AddDevice"/>. If the user already has ≥1 existing
/// device a <see cref="DeviceApprovalRequest"/> is created and <see cref="DeviceApprovalInfo"/>
/// is surfaced in the response so the mobile ENFORCE gate can activate.
/// </summary>
public sealed class VerifyOtpCommandHandler(
    IOtpService otpService,
    IUserRepository userRepository,
    IFirebaseAuthService firebaseAuthService,
    IRefreshTokenRepository refreshTokenRepository,
    IAuthDbContext db,
    IEventPublisher eventPublisher,
    IConfiguration configuration,
    ILogger<VerifyOtpCommandHandler> logger)
    : ICommandHandler<VerifyOtpCommand, VerifyOtpResponse>
{
    /// <inheritdoc />
    public async Task<Result<VerifyOtpResponse>> Handle(
        VerifyOtpCommand request,
        CancellationToken cancellationToken)
    {
        // Verify OTP — enforces 3-attempt limit + 30-min lockout
        var verifyResult = await otpService.VerifyOtpAsync(
            request.PhoneNumber, request.Otp, ct: cancellationToken);
        if (verifyResult.IsFailure)
            return verifyResult.Error;

        // Get or create user (GetByPhoneNumberAsync already includes Devices via Include)
        var user = await userRepository.GetByPhoneNumberAsync(request.PhoneNumber, cancellationToken);
        var isNewUser = user is null;

        if (isNewUser)
        {
            user = new User { PhoneNumber = request.PhoneNumber };
            user.AddDomainEvent(new UserRegisteredEvent(user.Id, request.PhoneNumber));
            user = await userRepository.AddAsync(user, cancellationToken);
        }

        var firebaseUid = user!.FirebaseUid ?? $"phone_{request.PhoneNumber}";
        var customTokenResult = await firebaseAuthService.CreateCustomTokenAsync(
            firebaseUid,
            new Dictionary<string, object>
            {
                ["userId"] = user.Id.ToString(),
                ["phoneNumber"] = request.PhoneNumber
            },
            cancellationToken);

        if (customTokenResult.IsFailure)
            return customTokenResult.Error;

        user.LastLoginAt = DateTime.UtcNow;

        // ── DG-AUTH-02 / GAP-047: Inline device registration ─────────────────
        // Perform device registration BEFORE issuing the refresh token so that the
        // device entity Id is available for the token's DeviceId init-only property.
        // Cannot dispatch AddDeviceCommand here because ICurrentUser is not populated
        // for this unauthenticated endpoint — we inline the same logic from AddDeviceCommandHandler.
        DeviceApprovalInfo? deviceApproval = null;
        Guid? deviceEntityId = null;

        if (!string.IsNullOrWhiteSpace(request.DeviceId) && !string.IsNullOrWhiteSpace(request.Platform))
        {
            // Count existing active devices BEFORE adding the new one.
            var existingActiveCount = user.Devices.Count(d => d.IsActive && d.DeletedAt == null);

            // Idempotent re-login on the same device — no new entity, no approval needed.
            var existingBound = user.Devices.FirstOrDefault(
                d => d.DeviceId == request.DeviceId && d.DeletedAt == null);

            if (existingBound is not null)
            {
                // Same device logging in again — re-link the upcoming refresh token
                // and persist the LastLoginAt update.
                deviceEntityId = existingBound.Id;
                await userRepository.UpdateAsync(user, cancellationToken);
            }
            else
            {
                var addResult = user.AddDevice(
                    request.DeviceId,
                    request.DeviceName ?? "Unknown Device",
                    request.Platform,
                    request.OsVersion,
                    request.AppVersion,
                    request.FcmToken);

                if (addResult.IsSuccess)
                {
                    // user.LastLoginAt was already set above; UpdateAsync persists both
                    // the timestamp update and the new UserDevice child.
                    await userRepository.UpdateAsync(user, cancellationToken);
                    var newDevice = user.Devices.Last();
                    deviceEntityId = newDevice.Id;

                    // GAP-047: second (or later) device → create an approval request.
                    if (existingActiveCount > 0)
                    {
                        var enforce = configuration["DeviceApproval:Enforce"] is "true" or "True";
                        var mode = enforce ? "ENFORCE" : "NOTIFY_ONLY";

                        // Note: newDeviceSessionTokenId will be the refresh token Id.
                        // RefreshToken.Id is set to NewGuid() before SaveChangesAsync, so we
                        // pre-generate the refresh token Id and pass it here.
                        var approvalRequest = DeviceApprovalRequest.Create(
                            userId: user.Id,
                            newDeviceId: newDevice.Id,
                            newDeviceIdentifier: request.DeviceId,
                            newDeviceName: request.DeviceName,
                            newDevicePlatform: request.Platform);

                        db.DeviceApprovalRequests.Add(approvalRequest);
                        await db.SaveChangesAsync(cancellationToken);

                        deviceApproval = new DeviceApprovalInfo(
                            Required: true,
                            RequestId: approvalRequest.Id,
                            Mode: mode);

                        logger.LogInformation(
                            "DG-AUTH-02/GAP-047: New device login for user {UserId}, " +
                            "device entity {DeviceEntityId}. ApprovalRequest {ApprovalId} " +
                            "created (enforce={Enforce}).",
                            user.Id, newDevice.Id, approvalRequest.Id, enforce);

                        // Publish push event so existing devices receive the approval prompt.
                        // Fire-and-forget — failure must NOT block the login response.
                        try
                        {
                            await eventPublisher.PublishAsync(
                                "device-approval-requests",
                                new DeviceApprovalRequestedEvent(
                                    user.Id,
                                    approvalRequest.Id,
                                    newDevice.Id,
                                    request.DeviceId,
                                    request.DeviceName ?? "Unknown Device",
                                    request.Platform,
                                    approvalRequest.ExpiresAt),
                                cancellationToken);
                        }
                        catch (Exception ex)
                        {
                            logger.LogError(ex,
                                "DG-AUTH-02/GAP-047: Failed to publish DeviceApprovalRequestedEvent " +
                                "for approval request {ApprovalId}. Login proceeds; push not delivered.",
                                approvalRequest.Id);
                        }
                    }
                }
                else
                {
                    // AddDevice returned a domain error (e.g. max-2-devices reached).
                    // Log and continue — device registration is best-effort at login time.
                    logger.LogWarning(
                        "DG-AUTH-02: AddDevice skipped for user {UserId}: {Error}",
                        user.Id, addResult.Error.Message);

                    // Still need to persist the LastLoginAt update.
                    await userRepository.UpdateAsync(user, cancellationToken);
                }
            }
        }
        else
        {
            // No DeviceId provided — persist LastLoginAt only.
            await userRepository.UpdateAsync(user, cancellationToken);
        }
        // ── End DG-AUTH-02 ─────────────────────────────────────────────────────

        // Issue initial refresh token — same generation pattern as RefreshTokenCommandHandler.
        // 64 random bytes → base64 plaintext returned to caller; SHA-256 hex stored in DB.
        // DeviceId init-only property set here now that we know the device entity Id.
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenPlain = Convert.ToBase64String(tokenBytes);
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tokenPlain)));

        var refreshToken = new Domain.Entities.RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            DeviceId = deviceEntityId,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshTokenRepository.AddAsync(refreshToken, cancellationToken);

        return new VerifyOtpResponse(
            isNewUser,
            customTokenResult.Value,
            user.Id,
            tokenPlain,
            refreshToken.ExpiresAt,
            deviceApproval);
    }
}
