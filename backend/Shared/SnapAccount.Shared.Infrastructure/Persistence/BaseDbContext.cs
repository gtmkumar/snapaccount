using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Infrastructure.Persistence;

/// <summary>
/// Abstract base DbContext shared by all SnapAccount microservices.
///
/// Following the Jason Taylor CleanArchitecture pattern, audit stamping and
/// domain event dispatch are handled by registered <c>ISaveChangesInterceptor</c>
/// instances (<see cref="Interceptors.AuditableEntityInterceptor"/> and
/// <see cref="Interceptors.DispatchDomainEventsInterceptor"/>) rather than inline
/// overrides in SaveChanges. This keeps the DbContext focused purely on schema
/// configuration.
///
/// Per-service DbContexts inherit from this class and:
/// <list type="bullet">
///   <item>Set <c>modelBuilder.HasDefaultSchema("&lt;schema&gt;")</c></item>
///   <item>Call <c>modelBuilder.ApplyConfigurationsFromAssembly(...)</c></item>
///   <item>Implement the per-service <c>IXxxDbContext</c> interface from their Application layer</item>
/// </list>
///
/// Global soft-delete query filters (<c>DeletedAt IS NULL</c>) are applied here for all
/// <see cref="BaseEntity"/> types so no handler needs to remember to filter deleted records.
/// </summary>
public abstract class BaseDbContext(DbContextOptions options) : DbContext(options)
{
    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            // Global soft-delete filter: only return rows where deleted_at IS NULL
            // Only applied to BaseAuditableEntity subtypes (they carry DeletedAt).
            // BaseEntity subtypes without audit columns are not filtered.
            if (typeof(BaseAuditableEntity).IsAssignableFrom(entityType.ClrType))
            {
                var entity = modelBuilder.Entity(entityType.ClrType);
                entity.HasQueryFilter(BuildSoftDeleteFilter(entityType.ClrType));

                // created_by / updated_by are `uuid` columns but the CLR properties are
                // string (they hold the user's UUID). Convert string <-> Guid so Npgsql
                // binds a uuid-typed parameter instead of text. Null passes through.
                entity.Property(nameof(BaseAuditableEntity.CreatedBy)).HasConversion(GuidStringConverter);
                entity.Property(nameof(BaseAuditableEntity.UpdatedBy)).HasConversion(GuidStringConverter);
            }
        }
    }

    /// <summary>Maps a CLR string holding a UUID to a Postgres <c>uuid</c> column (null-safe).</summary>
    private static readonly ValueConverter<string, Guid> GuidStringConverter =
        new(v => Guid.Parse(v), v => v.ToString());

    /// <summary>
    /// Builds a compiled lambda for the soft-delete global query filter.
    /// Produces: <c>e => e.DeletedAt == null</c> for the given entity type.
    /// </summary>
    private static System.Linq.Expressions.LambdaExpression BuildSoftDeleteFilter(Type type)
    {
        var param = System.Linq.Expressions.Expression.Parameter(type, "e");
        var body = System.Linq.Expressions.Expression.Equal(
            System.Linq.Expressions.Expression.Property(param, nameof(BaseAuditableEntity.DeletedAt)),
            System.Linq.Expressions.Expression.Constant(null, typeof(DateTime?)));
        return System.Linq.Expressions.Expression.Lambda(body, param);
    }
}
