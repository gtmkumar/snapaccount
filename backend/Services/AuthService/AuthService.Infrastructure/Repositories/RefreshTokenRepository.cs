using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Domain;

namespace AuthService.Infrastructure.Repositories;

public sealed class RefreshTokenRepository(AuthDbContext dbContext) : IRefreshTokenRepository
{
    public Task<RefreshToken?> GetByTokenHashAsync(string tokenHash, CancellationToken ct = default)
        => dbContext.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == tokenHash, ct);

    public async Task<RefreshToken> AddAsync(RefreshToken token, CancellationToken ct = default)
    {
        dbContext.RefreshTokens.Add(token);
        await dbContext.SaveChangesAsync(ct);
        return token;
    }

    public async Task UpdateAsync(RefreshToken token, CancellationToken ct = default)
    {
        dbContext.RefreshTokens.Update(token);
        await dbContext.SaveChangesAsync(ct);
    }

    public async Task RevokeAllForUserAsync(Guid userId, string reason, CancellationToken ct = default)
    {
        var tokens = await dbContext.RefreshTokens
            .Where(r => r.UserId == userId && !r.IsRevoked && r.DeletedAt == null)
            .ToListAsync(ct);

        foreach (var token in tokens)
            token.Revoke(reason);

        await dbContext.SaveChangesAsync(ct);
    }
}
