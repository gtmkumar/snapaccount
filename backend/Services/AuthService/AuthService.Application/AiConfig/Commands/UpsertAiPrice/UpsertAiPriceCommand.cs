using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Commands.UpsertAiPrice;

/// <summary>Create or update a price-catalog entry (Super Admin). Rates are USD.</summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformAiManage)]
public record UpsertAiPriceCommand(
    string Provider,
    string Model,
    decimal InputPerMillion,
    decimal OutputPerMillion,
    decimal PerPage,
    bool IsActive = true) : ICommand<Guid>;

public sealed class UpsertAiPriceCommandHandler(IAuthDbContext db)
    : ICommandHandler<UpsertAiPriceCommand, Guid>
{
    public async Task<Result<Guid>> Handle(UpsertAiPriceCommand request, CancellationToken ct)
    {
        var provider = request.Provider.Trim().ToLowerInvariant();
        var model = request.Model.Trim();

        var row = await db.AiModelPrices
            .FirstOrDefaultAsync(p => p.Provider == provider && p.Model == model && p.DeletedAt == null, ct);

        if (row is null)
        {
            row = AiModelPrice.Create(provider, model, request.InputPerMillion, request.OutputPerMillion, request.PerPage);
            row.UpdateRates(null, null, null, request.IsActive);
            db.AiModelPrices.Add(row);
        }
        else
        {
            row.UpdateRates(request.InputPerMillion, request.OutputPerMillion, request.PerPage, request.IsActive);
        }

        await db.SaveChangesAsync(ct);
        return row.Id;
    }
}
