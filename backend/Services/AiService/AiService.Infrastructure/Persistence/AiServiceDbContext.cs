using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace AiService.Infrastructure.Persistence;

public class AiServiceDbContext(DbContextOptions<AiServiceDbContext> options) : BaseDbContext(options)
{
    // TODO: Add DbSet<T> properties for all domain entities

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("ai");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AiServiceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
