using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Assessees.Commands.UpdateProfile;

/// <summary>Creates or updates the assessee profile. PAN stored encrypted (P6-HANDOFF-19).</summary>
[RequiresPermission("itr.profile.update")]
public record UpdateProfileCommand(
    string UserId,
    string PanCipher,
    string PanLast4,
    string FullName,
    string AssesseeType,
    Guid? OrganizationId,
    string? Email,
    string? Phone,
    DateOnly? DateOfBirth,
    string? Address,
    decimal? AnnualTurnoverCr) : ICommand<UpdateProfileResponse>;

public record UpdateProfileResponse(Guid AssesseeId, string PanLast4, string FullName);

public sealed class UpdateProfileCommandValidator : AbstractValidator<UpdateProfileCommand>
{
    public UpdateProfileCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty().MaximumLength(128);
        RuleFor(x => x.PanCipher).NotEmpty(); // must be ciphertext — not validated here, IPanEncryptionService validates format before encrypting
        RuleFor(x => x.PanLast4).NotEmpty().Length(4);
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AssesseeType)
            .Must(t => t is "INDIVIDUAL" or "HUF" or "FIRM" or "COMPANY" or "AOP" or "BOI" or "AJP")
            .WithMessage("Invalid AssesseeType.");
        RuleFor(x => x.Email).EmailAddress().When(x => x.Email is not null).MaximumLength(200);
        RuleFor(x => x.Phone).Matches(@"^[6-9]\d{9}$").When(x => x.Phone is not null)
            .WithMessage("Phone must be a valid Indian mobile number.");
    }
}

public sealed class UpdateProfileCommandHandler(IItrDbContext dbContext)
    : ICommandHandler<UpdateProfileCommand, UpdateProfileResponse>
{
    public async Task<Result<UpdateProfileResponse>> Handle(UpdateProfileCommand request, CancellationToken cancellationToken)
    {
        var existing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.UserId == request.UserId && a.DeletedAt == null), cancellationToken);

        Assessee assessee;
        if (existing is null)
        {
            assessee = Assessee.Create(request.UserId, request.PanCipher, request.PanLast4,
                request.FullName, request.AssesseeType, request.OrganizationId);
            dbContext.Assessees.Add(assessee);
        }
        else
        {
            assessee = existing;
            // PAN cannot be changed once set (immutable compliance field)
            assessee.UpdateContact(request.Email, request.Phone, request.DateOfBirth, request.Address);
            assessee.SetTurnover(request.AnnualTurnoverCr);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return new UpdateProfileResponse(assessee.Id, assessee.PanLast4, assessee.FullName);
    }
}
