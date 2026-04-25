using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CallbackService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the callback schema database context.
/// Command and query handlers depend on this interface.
/// </summary>
public interface ICallbackDbContext
{
    DbSet<Callback> Callbacks { get; }
    DbSet<CallNote> CallNotes { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
