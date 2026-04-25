using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace CallbackService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the callback schema.
/// Implements <see cref="ICallbackDbContext"/> for testability.
/// </summary>
public class CallbackDbContext(DbContextOptions<CallbackDbContext> options)
    : BaseDbContext(options), ICallbackDbContext
{
    public DbSet<Callback> Callbacks => Set<Callback>();
    public DbSet<CallNote> CallNotes => Set<CallNote>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("callback");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CallbackDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
