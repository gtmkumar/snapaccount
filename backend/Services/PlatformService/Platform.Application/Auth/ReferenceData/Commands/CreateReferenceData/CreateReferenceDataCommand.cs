using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using ReferenceDataEntity = AuthService.Domain.Entities.ReferenceData;

namespace AuthService.Application.ReferenceData.Commands.CreateReferenceData;

/// <summary>
/// Creates a new reference-data entry. Requires <c>platform.refdata.manage</c>.
///
/// Validation rules:
///   • category ∈ {LANGUAGE, USER_TYPE, GENDER, STATE, COUNTRY}
///   • code format: ^[A-Za-z0-9_-]+$ (trimmed, stored as provided — case preserved)
///   • (category, code) unique WHERE deleted_at IS NULL → 409 ReferenceData.Duplicate
///   • category = STATE → parentCode REQUIRED and must reference an active COUNTRY code
/// </summary>
[RequiresPermission(Permissions.PlatformRefDataManage)]
public record CreateReferenceDataCommand(
    string Category,
    string Code,
    string Name,
    string? ParentCode,
    int SortOrder = 0) : ICommand<CreateReferenceDataResponse>;

/// <summary>Response DTO matching the GET shape so callers can use it immediately.</summary>
public record CreateReferenceDataResponse(
    Guid Id,
    string Category,
    string Code,
    string Name,
    string? ParentCode,
    bool IsActive,
    int SortOrder);

public sealed class CreateReferenceDataCommandValidator : AbstractValidator<CreateReferenceDataCommand>
{
    public CreateReferenceDataCommandValidator()
    {
        RuleFor(x => x.Category)
            .NotEmpty()
            .Must(c => ReferenceDataCategory.All.Contains(c?.Trim().ToUpperInvariant() ?? ""))
            .WithMessage(
                $"Category must be one of: {string.Join(", ", ReferenceDataCategory.All)}.");

        RuleFor(x => x.Code)
            .NotEmpty()
            .MaximumLength(100)
            .Matches(@"^[A-Za-z0-9_-]+$")
            .WithMessage("Code must contain only letters, digits, underscores, or hyphens.");

        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(300);
    }
}

public sealed class CreateReferenceDataCommandHandler(IAuthDbContext db)
    : ICommandHandler<CreateReferenceDataCommand, CreateReferenceDataResponse>
{
    public async Task<Result<CreateReferenceDataResponse>> Handle(
        CreateReferenceDataCommand request,
        CancellationToken cancellationToken)
    {
        var category = request.Category.Trim().ToUpperInvariant();
        var code     = request.Code.Trim();

        // ── Uniqueness check (case-sensitive code, category already upper) ─────
        var duplicate = await db.ReferenceData
            .AnyAsync(r =>
                r.Category == category &&
                r.Code == code &&
                r.DeletedAt == null,
                cancellationToken);

        if (duplicate)
            return Error.Conflict(
                "ReferenceData.Duplicate",
                $"A '{category}' entry with code '{code}' already exists.");

        // ── STATE requires valid COUNTRY parent ───────────────────────────────
        if (category == ReferenceDataCategory.State)
        {
            if (string.IsNullOrWhiteSpace(request.ParentCode))
                return Error.Validation(
                    "ReferenceData.ParentCodeRequired",
                    "STATE entries require a parentCode referencing an active COUNTRY code.");

            var parentExists = await db.ReferenceData
                .AnyAsync(r =>
                    r.Category == ReferenceDataCategory.Country &&
                    r.Code == request.ParentCode.Trim() &&
                    r.IsActive &&
                    r.DeletedAt == null,
                    cancellationToken);

            if (!parentExists)
                return Error.Validation(
                    "ReferenceData.InvalidParentCode",
                    $"No active COUNTRY entry with code '{request.ParentCode}' exists.");
        }

        var entry = ReferenceDataEntity.Create(
            category, code, request.Name, request.ParentCode, request.SortOrder);

        db.ReferenceData.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        return new CreateReferenceDataResponse(
            entry.Id, entry.Category, entry.Code, entry.Name,
            entry.ParentCode, entry.IsActive, entry.SortOrder);
    }
}
