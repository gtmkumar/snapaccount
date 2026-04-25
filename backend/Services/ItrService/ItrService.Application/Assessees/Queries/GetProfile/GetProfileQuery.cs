using FluentValidation;
using ItrService.Application.Common.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Assessees.Queries.GetProfile;

/// <summary>Returns the assessee profile. PAN shown as last-4 only.</summary>
public record GetProfileQuery(string UserId) : IQuery<AssesseeProfileDto>;

public record AssesseeProfileDto(
    Guid Id, string UserId, string PanLast4, string FullName, string AssesseeType,
    string? Email, string? Phone, DateOnly? DateOfBirth, string? Address, decimal? AnnualTurnoverCr);

public sealed class GetProfileQueryValidator : AbstractValidator<GetProfileQuery>
{
    public GetProfileQueryValidator() { RuleFor(x => x.UserId).NotEmpty(); }
}

public sealed class GetProfileQueryHandler(IItrDbContext dbContext) : IQueryHandler<GetProfileQuery, AssesseeProfileDto>
{
    public async Task<Result<AssesseeProfileDto>> Handle(GetProfileQuery request, CancellationToken cancellationToken)
    {
        var a = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.UserId == request.UserId && a.DeletedAt == null), cancellationToken);
        if (a is null) return Error.NotFound("Assessee.NotFound", $"Profile not found for user {request.UserId}.");
        return new AssesseeProfileDto(a.Id, a.UserId, a.PanLast4, a.FullName, a.AssesseeType,
            a.Email, a.PhoneNumber, a.DateOfBirth, a.Address, a.AnnualTurnoverCr);
    }
}
