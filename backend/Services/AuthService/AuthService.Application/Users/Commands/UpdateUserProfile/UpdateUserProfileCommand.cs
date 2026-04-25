using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Users.Commands.UpdateUserProfile;

/// <summary>Updates the authenticated user's profile fields.</summary>
/// <param name="PanNumber">PAN in XXXXX9999X format. SEC-013: stored AES-256 encrypted.</param>
/// <param name="AadhaarLast4">Last 4 digits of Aadhaar (for display only — full Aadhaar never stored).</param>
public record UpdateUserProfileCommand(
    string? FullName,
    string? Email,
    string? PanNumber,
    string? AadhaarLast4,
    DateOnly? DateOfBirth,
    string? Gender,
    string? AddressLine1,
    string? AddressLine2,
    string? City,
    string? State,
    string? Pincode) : ICommand;

/// <summary>
/// FluentValidation validator for <see cref="UpdateUserProfileCommand"/>.
/// Enforces Indian compliance: PAN XXXXX9999X format and Aadhaar last-4 rules.
/// </summary>
public sealed class UpdateUserProfileCommandValidator : AbstractValidator<UpdateUserProfileCommand>
{
    public UpdateUserProfileCommandValidator()
    {
        When(x => !string.IsNullOrEmpty(x.PanNumber), () =>
            RuleFor(x => x.PanNumber!)
                .Matches(@"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
                .WithMessage("PAN number format is invalid (XXXXX9999X)."));

        When(x => !string.IsNullOrEmpty(x.AadhaarLast4), () =>
            RuleFor(x => x.AadhaarLast4!)
                .Length(4).WithMessage("Aadhaar last 4 must be exactly 4 digits.")
                .Matches(@"^\d{4}$").WithMessage("Aadhaar last 4 must be numeric."));
    }
}

/// <summary>
/// Handles profile updates.
/// SEC-013: encrypts the PAN number with AES-256 before persisting — plaintext PAN is never stored.
/// </summary>
public sealed class UpdateUserProfileCommandHandler(
    IUserRepository userRepository,
    IPanEncryptionService panEncryptionService,
    ICurrentUser currentUser)
    : ICommandHandler<UpdateUserProfileCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        UpdateUserProfileCommand request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(currentUser.UserId, cancellationToken);
        if (user is null)
            return Result.Failure(Error.NotFound("User", currentUser.UserId));

        // SEC-013: Encrypt PAN before storing. Never persist plaintext PAN.
        var encryptedPan = !string.IsNullOrEmpty(request.PanNumber)
            ? panEncryptionService.Encrypt(request.PanNumber)
            : request.PanNumber;

        if (user.Profile is null)
        {
            var profile = new UserProfile { UserId = user.Id };
            profile.PanNumber = encryptedPan;
            profile.AadhaarLast4 = request.AadhaarLast4;
            profile.DateOfBirth = request.DateOfBirth;
            profile.Gender = request.Gender;
            profile.AddressLine1 = request.AddressLine1;
            profile.AddressLine2 = request.AddressLine2;
            profile.City = request.City;
            profile.State = request.State;
            profile.Pincode = request.Pincode;
            user.SetProfile(profile);
        }
        else
        {
            user.Profile.PanNumber = encryptedPan;
            user.Profile.AadhaarLast4 = request.AadhaarLast4;
            user.Profile.DateOfBirth = request.DateOfBirth;
            user.Profile.Gender = request.Gender;
            user.Profile.AddressLine1 = request.AddressLine1;
            user.Profile.AddressLine2 = request.AddressLine2;
            user.Profile.City = request.City;
            user.Profile.State = request.State;
            user.Profile.Pincode = request.Pincode;
        }

        user.FullName = request.FullName;
        user.Email = request.Email;
        await userRepository.UpdateAsync(user, cancellationToken);
        return Result.Success();
    }
}
