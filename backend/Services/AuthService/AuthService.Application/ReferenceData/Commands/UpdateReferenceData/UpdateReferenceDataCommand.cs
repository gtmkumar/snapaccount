using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.ReferenceData.Commands.UpdateReferenceData;

/// <summary>
/// Updates the mutable fields of a reference-data entry. Requires <c>platform.refdata.manage</c>.
/// Category and Code are immutable after creation — changing a code would break profile
/// rows that store the old code value.
/// All fields are optional (null = no change), except name which is required if provided.
/// </summary>
[RequiresPermission(Permissions.PlatformRefDataManage)]
public record UpdateReferenceDataCommand(
    Guid Id,
    string? Name,
    string? ParentCode,
    int? SortOrder,
    bool? IsActive) : ICommand;

public sealed class UpdateReferenceDataCommandValidator : AbstractValidator<UpdateReferenceDataCommand>
{
    public UpdateReferenceDataCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();

        When(x => x.Name is not null, () =>
            RuleFor(x => x.Name!)
                .NotEmpty().WithMessage("Name must not be empty when provided.")
                .MaximumLength(300));
    }
}

public sealed class UpdateReferenceDataCommandHandler(IAuthDbContext db)
    : ICommandHandler<UpdateReferenceDataCommand>
{
    public async Task<Result> Handle(
        UpdateReferenceDataCommand request,
        CancellationToken cancellationToken)
    {
        var entry = await db.ReferenceData
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.DeletedAt == null, cancellationToken);

        if (entry is null)
            return Result.Failure(Error.NotFound("ReferenceData", request.Id));

        // ── If parentCode is being updated and category is STATE, validate the new parent ─
        if (request.ParentCode is not null &&
            entry.Category == ReferenceDataCategory.State &&
            !string.IsNullOrWhiteSpace(request.ParentCode))
        {
            var parentExists = await db.ReferenceData
                .AnyAsync(r =>
                    r.Category == ReferenceDataCategory.Country &&
                    r.Code == request.ParentCode.Trim() &&
                    r.IsActive &&
                    r.DeletedAt == null,
                    cancellationToken);

            if (!parentExists)
                return Result.Failure(Error.Validation(
                    "ReferenceData.InvalidParentCode",
                    $"No active COUNTRY entry with code '{request.ParentCode}' exists."));
        }

        entry.UpdateDetails(
            name:       request.Name ?? entry.Name,
            parentCode: request.ParentCode ?? entry.ParentCode,
            sortOrder:  request.SortOrder ?? entry.SortOrder);

        if (request.IsActive.HasValue)
            entry.SetActive(request.IsActive.Value);

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
