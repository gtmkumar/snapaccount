using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Domain;

namespace AuthService.Infrastructure.Repositories;

public sealed class OrganizationRepository(AuthDbContext dbContext) : IOrganizationRepository
{
    public Task<Organization?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.Organizations
            .Include(o => o.Members)
            .FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task<Organization> AddAsync(Organization organization, CancellationToken ct = default)
    {
        dbContext.Organizations.Add(organization);
        await dbContext.SaveChangesAsync(ct);
        return organization;
    }

    public async Task UpdateAsync(Organization organization, CancellationToken ct = default)
    {
        dbContext.Organizations.Update(organization);
        await dbContext.SaveChangesAsync(ct);
    }

    public async Task<(IReadOnlyList<Organization> Items, int TotalCount)> ListAsync(
        int page, int pageSize, string? search, bool? isActive, CancellationToken ct = default)
    {
        var query = dbContext.Organizations
            .Where(o => o.DeletedAt == null)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(o => o.BusinessName.ToLower().Contains(s) ||
                                     (o.Gstin != null && o.Gstin.ToLower().Contains(s)));
        }

        if (isActive.HasValue)
            query = query.Where(o => o.IsActive == isActive.Value);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, total);
    }

    public async Task SuspendAsync(Guid id, CancellationToken ct = default)
    {
        await dbContext.Organizations
            .Where(o => o.Id == id)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(o => o.IsActive, false),
                ct);
    }
}
