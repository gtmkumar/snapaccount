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
}
