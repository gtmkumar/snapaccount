using AuthService.Application.Common.Interfaces;
using AuthService.Domain;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using ReferenceDataEntity = AuthService.Domain.Entities.ReferenceData;

namespace AuthService.Application.ReferenceData.Commands.DeleteReferenceData;

/// <summary>
/// Soft-deletes a reference-data entry. Requires <c>platform.refdata.manage</c>.
///
/// IN-USE GUARD: if a STATE/COUNTRY/USER_TYPE/GENDER/LANGUAGE value is currently stored
/// in auth.user_profile (state, country, gender, user_type columns) or auth.user
/// (preferred_language), the delete is BLOCKED and 409 ReferenceData.InUse is returned
/// with the count of referencing rows.
/// </summary>
[RequiresPermission(Permissions.PlatformRefDataManage)]
public record DeleteReferenceDataCommand(Guid Id) : ICommand;

public sealed class DeleteReferenceDataCommandHandler(IAuthDbContext db)
    : ICommandHandler<DeleteReferenceDataCommand>
{
    public async Task<Result> Handle(
        DeleteReferenceDataCommand request,
        CancellationToken cancellationToken)
    {
        var entry = await db.ReferenceData
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.DeletedAt == null, cancellationToken);

        if (entry is null)
            return Result.Failure(Error.NotFound("ReferenceData", request.Id));

        // ── In-use guard ─────────────────────────────────────────────────────
        var useCount = await CountUsagesAsync(entry, cancellationToken);

        if (useCount > 0)
            return Result.Failure(Error.Conflict(
                "ReferenceData.InUse",
                $"This reference-data entry is referenced by {useCount} record(s) " +
                "and cannot be deleted. Update those records first."));

        entry.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    /// <summary>
    /// Counts how many user/profile rows reference this entry's code.
    /// Checks the column(s) relevant to the entry's category.
    ///
    /// I1.4A-001: Unknown/new categories throw <see cref="InvalidOperationException"/>
    /// rather than silently returning 0 (default-deny — prevents in-use entries
    /// from being deleted when a new category is added without wiring its check).
    /// </summary>
    private async Task<int> CountUsagesAsync(
        ReferenceDataEntity entry,
        CancellationToken ct)
    {
        return entry.Category switch
        {
            "COUNTRY" => await db.UserProfiles
                .CountAsync(p => p.Country == entry.Code && p.DeletedAt == null, ct),

            "STATE" => await db.UserProfiles
                .CountAsync(p => p.State == entry.Code && p.DeletedAt == null, ct),

            "GENDER" => await db.UserProfiles
                .CountAsync(p => p.Gender == entry.Code && p.DeletedAt == null, ct),

            "USER_TYPE" => await db.UserProfiles
                .CountAsync(p => p.UserType == entry.Code && p.DeletedAt == null, ct),

            "LANGUAGE" => await db.Users
                .CountAsync(u => u.PreferredLanguage == entry.Code && u.DeletedAt == null, ct),

            // I1.4A-001: Default-deny — require developers to explicitly wire in-use
            // checks for any new category rather than silently allowing deletions.
            var unknown => throw new InvalidOperationException(
                $"ReferenceData category '{unknown}' does not have an in-use check registered. " +
                "Add a CountAsync branch to CountUsagesAsync before allowing deletion of this category."),
        };
    }
}
