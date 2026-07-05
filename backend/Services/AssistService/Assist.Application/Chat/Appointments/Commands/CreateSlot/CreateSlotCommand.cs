using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.CreateSlot;

/// <summary>
/// Creates a new availability slot for the current CA user.
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record CreateSlotCommand(
    DateTime StartUtc,
    DateTime EndUtc) : ICommand<CreateSlotResponse>;

/// <summary>Response after creating a slot.</summary>
public record CreateSlotResponse(
    Guid SlotId,
    Guid CaProfileId,
    DateTime StartUtc,
    DateTime EndUtc);

/// <summary>Validates CreateSlotCommand.</summary>
public sealed class CreateSlotCommandValidator : AbstractValidator<CreateSlotCommand>
{
    public CreateSlotCommandValidator()
    {
        RuleFor(x => x.StartUtc).NotEmpty().GreaterThan(DateTime.UtcNow).WithMessage("Slot start must be in the future.");
        RuleFor(x => x.EndUtc).NotEmpty().GreaterThan(x => x.StartUtc).WithMessage("Slot end must be after start.");
    }
}

/// <summary>Handles CreateSlotCommand — creates an availability slot for the current CA.</summary>
public sealed class CreateSlotCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CreateSlotCommand, CreateSlotResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateSlotResponse>> Handle(
        CreateSlotCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<CreateSlotResponse>.Failure(Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        // Find or create CA profile for this user
        var profile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

        if (profile == null)
            return Result<CreateSlotResponse>.Failure(Error.NotFound("CaProfile.NotFound",
                "No CA profile found for your account. Contact an admin to set up your profile."));

        var slotResult = AppointmentSlot.Create(profile.Id, request.StartUtc, request.EndUtc);
        if (!slotResult.IsSuccess)
            return Result<CreateSlotResponse>.Failure(slotResult.Error!);

        db.AppointmentSlots.Add(slotResult.Value!);
        await db.SaveChangesAsync(cancellationToken);

        return Result<CreateSlotResponse>.Success(new CreateSlotResponse(
            slotResult.Value!.Id, profile.Id, request.StartUtc, request.EndUtc));
    }
}
