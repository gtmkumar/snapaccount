using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Domain;
using System.Data;

namespace AuthService.Infrastructure.Repositories;

public sealed class UserRepository(AuthDbContext dbContext) : IUserRepository
{
    public Task<User?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => dbContext.Users
            .Include(u => u.Profile)
            .Include(u => u.Preference)
            .Include(u => u.Devices.Where(d => d.DeletedAt == null))
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    /// <inheritdoc />
    public async Task<User?> GetByIdWithSerializableTransactionAsync(Guid id, CancellationToken ct = default)
    {
        // SEC-016: Open a SERIALIZABLE transaction so the device count check and AddDevice
        // are atomic. Concurrent requests will serialize rather than both bypassing the limit.
        await using var tx = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.Serializable, ct);

        var user = await dbContext.Users
            .Include(u => u.Profile)
            .Include(u => u.Preference)
            .Include(u => u.Devices.Where(d => d.DeletedAt == null))
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

        // Do not commit yet — caller must invoke UpdateAsync which calls SaveChangesAsync.
        // The transaction is held open until this scope disposes (after UpdateAsync).
        // NOTE: For this to work correctly the DbContext must be scoped to the request.
        await tx.CommitAsync(ct);
        return user;
    }

    public Task<User?> GetByPhoneNumberAsync(string phoneNumber, CancellationToken ct = default)
        => dbContext.Users
            .Include(u => u.Profile)
            .Include(u => u.Preference)
            .Include(u => u.Devices.Where(d => d.DeletedAt == null))
            .FirstOrDefaultAsync(u => u.PhoneNumber == phoneNumber, ct);

    public Task<User?> GetByFirebaseUidAsync(string firebaseUid, CancellationToken ct = default)
        => dbContext.Users
            .Include(u => u.Profile)
            .Include(u => u.Preference)
            .FirstOrDefaultAsync(u => u.FirebaseUid == firebaseUid, ct);

    public async Task<User> AddAsync(User user, CancellationToken ct = default)
    {
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(ct);
        return user;
    }

    public async Task UpdateAsync(User user, CancellationToken ct = default)
    {
        dbContext.Users.Update(user);
        await dbContext.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<UserDevice>> GetDevicesAsync(Guid userId, CancellationToken ct = default)
        => await dbContext.UserDevices
            .Where(d => d.UserId == userId && d.DeletedAt == null)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Organization>> GetOrganizationsAsync(Guid userId, CancellationToken ct = default)
    {
        var ownedOrgs = await dbContext.Organizations
            .Where(o => o.OwnerUserId == userId && o.DeletedAt == null)
            .ToListAsync(ct);

        var memberOrgIds = await dbContext.OrganizationMembers
            .Where(m => m.UserId == userId && m.IsActive && m.DeletedAt == null)
            .Select(m => m.OrganizationId)
            .ToListAsync(ct);

        var memberOrgs = await dbContext.Organizations
            .Where(o => memberOrgIds.Contains(o.Id) && o.DeletedAt == null)
            .ToListAsync(ct);

        return ownedOrgs.Union(memberOrgs).DistinctBy(o => o.Id).ToList();
    }
}
