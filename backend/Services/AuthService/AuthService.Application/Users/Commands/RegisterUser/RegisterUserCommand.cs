using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Users.Commands.RegisterUser;

/// <summary>
/// Registers a new user or upserts an existing user's Firebase link.
/// Called after OTP verification when the user first authenticates.
/// </summary>
/// <param name="PhoneNumber">Validated Indian mobile number (6-9 prefix, 10 digits).</param>
/// <param name="FirebaseUid">Firebase UID from the verified ID token.</param>
/// <param name="FullName">Display name (optional at registration).</param>
/// <param name="Email">Email address (optional at registration).</param>
/// <param name="UserType">BUSINESS_OWNER, EMPLOYEE, or STAFF.</param>
public record RegisterUserCommand(
    string PhoneNumber,
    string FirebaseUid,
    string? FullName,
    string? Email,
    string UserType = "BUSINESS_OWNER") : ICommand<RegisterUserResponse>;

/// <summary>Response returned after registration. <c>IsNewUser</c> indicates first-time sign-up.</summary>
public record RegisterUserResponse(Guid UserId, bool IsNewUser);

/// <summary>FluentValidation validator for <see cref="RegisterUserCommand"/>.</summary>
public sealed class RegisterUserCommandValidator : AbstractValidator<RegisterUserCommand>
{
    public RegisterUserCommandValidator()
    {
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^[6-9]\d{9}$")
            .WithMessage("Must be a valid Indian mobile number.");

        RuleFor(x => x.FirebaseUid)
            .NotEmpty()
            .WithMessage("Firebase UID is required.");

        RuleFor(x => x.UserType)
            .Must(t => t is "BUSINESS_OWNER" or "EMPLOYEE" or "STAFF")
            .WithMessage("UserType must be BUSINESS_OWNER, EMPLOYEE, or STAFF.");
    }
}

/// <summary>
/// Handles user registration. Upserts existing users (links Firebase UID if missing),
/// or creates a new <see cref="User"/> aggregate with initial <see cref="UserProfile"/>
/// and <see cref="UserPreference"/>.
/// </summary>
public sealed class RegisterUserCommandHandler(IUserRepository userRepository)
    : ICommandHandler<RegisterUserCommand, RegisterUserResponse>
{
    /// <inheritdoc />
    public async Task<Result<RegisterUserResponse>> Handle(
        RegisterUserCommand request,
        CancellationToken cancellationToken)
    {
        var existingUser = await userRepository.GetByPhoneNumberAsync(
            request.PhoneNumber, cancellationToken);

        if (existingUser is not null)
        {
            // Link Firebase UID if not yet linked (e.g. migrated user)
            if (string.IsNullOrEmpty(existingUser.FirebaseUid))
            {
                existingUser.LinkFirebaseUid(request.FirebaseUid);
                existingUser.FullName = request.FullName;
                existingUser.Email = request.Email;
                await userRepository.UpdateAsync(existingUser, cancellationToken);
            }

            return new RegisterUserResponse(existingUser.Id, IsNewUser: false);
        }

        var user = new User { PhoneNumber = request.PhoneNumber };
        user.AddDomainEvent(new UserRegisteredEvent(user.Id, request.PhoneNumber!));
        user.LinkFirebaseUid(request.FirebaseUid);
        user.FullName = request.FullName;
        user.Email = request.Email;

        // Preserve original behaviour: profile/preference objects are constructed but not
        // attached — EF change-tracking via owned navigation properties handles persistence.
        _ = new UserProfile { UserId = user.Id, UserType = request.UserType };
        _ = new UserPreference { UserId = user.Id };

        user = await userRepository.AddAsync(user, cancellationToken);
        return new RegisterUserResponse(user.Id, IsNewUser: true);
    }
}
