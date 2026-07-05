using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Repositories;

/// <summary>Write-side repository for <see cref="Invitation"/> aggregates.</summary>
public sealed class InvitationRepository(AuthDbContext db) : IInvitationRepository
{
    /// <inheritdoc />
    public Task<Invitation?> GetByTokenHashAsync(string tokenHash, CancellationToken ct = default)
        => db.Invitations
            .Include(i => i.Organization)
            .Include(i => i.Role)
            .FirstOrDefaultAsync(i => i.TokenHash == tokenHash && i.DeletedAt == null, ct);

    /// <inheritdoc />
    public Task<Invitation?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => db.Invitations
            .FirstOrDefaultAsync(i => i.Id == id && i.DeletedAt == null, ct);

    /// <inheritdoc />
    public async Task<Invitation> AddAsync(Invitation invitation, CancellationToken ct = default)
    {
        db.Invitations.Add(invitation);
        await db.SaveChangesAsync(ct);
        return invitation;
    }

    /// <inheritdoc />
    public async Task UpdateAsync(Invitation invitation, CancellationToken ct = default)
    {
        db.Invitations.Update(invitation);
        await db.SaveChangesAsync(ct);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<Invitation>> GetByOrganizationAsync(
        Guid organizationId, CancellationToken ct = default)
        => await db.Invitations
            .Where(i => i.OrganizationId == organizationId && i.DeletedAt == null)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync(ct);

    /// <inheritdoc />
    public Task<bool> HasPendingInviteAsync(Guid organizationId, string email, CancellationToken ct = default)
        => db.Invitations
            .AnyAsync(i =>
                i.OrganizationId == organizationId &&
                i.Email == email.ToLowerInvariant().Trim() &&
                i.Status == InvitationStatus.Pending &&
                i.DeletedAt == null &&
                i.ExpiresAt > DateTime.UtcNow,
                ct);
}
