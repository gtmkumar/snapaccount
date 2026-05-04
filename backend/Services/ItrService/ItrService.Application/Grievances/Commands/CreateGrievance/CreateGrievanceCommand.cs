using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Grievances.Commands.CreateGrievance;

/// <summary>
/// Raises a grievance against an ITR filing (P6-HANDOFF-23).
/// Filing must belong to the caller's organisation (SEC-039 IDOR guard).
/// </summary>
[RequiresPermission("itr.grievance.create")]
public record CreateGrievanceCommand(
    Guid FilingId,
    string Subject,
    string Body,
    string Category) : ICommand<CreateGrievanceResponse>;

public record CreateGrievanceResponse(Guid GrievanceId, string Status);

public sealed class CreateGrievanceCommandValidator : AbstractValidator<CreateGrievanceCommand>
{
    public CreateGrievanceCommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.Subject).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Body).NotEmpty().MaximumLength(5000);
        RuleFor(x => x.Category).NotEmpty().MaximumLength(60);
    }
}

public sealed class CreateGrievanceCommandHandler(IItrDbContext db, ICurrentUser currentUser)
    : ICommandHandler<CreateGrievanceCommand, CreateGrievanceResponse>
{
    public async Task<Result<CreateGrievanceResponse>> Handle(
        CreateGrievanceCommand request, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        var filing = await db.Filings
            .Where(f => f.Id == request.FilingId && f.DeletedAt == null)
            .FirstOrDefaultAsync(ct);
        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-039: assessee must belong to caller's org — NotFound to avoid existence leak.
        var assessee = await db.Assessees
            .Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null)
            .FirstOrDefaultAsync(ct);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        var grievance = Grievance.Create(
            filing.Id, assessee.Id, currentUser.UserId,
            request.Subject, request.Body, request.Category);

        db.Grievances.Add(grievance);
        await db.SaveChangesAsync(ct);

        return new CreateGrievanceResponse(grievance.Id, grievance.Status);
    }
}
