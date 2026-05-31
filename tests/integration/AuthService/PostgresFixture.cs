// Shared PostgreSQL Testcontainer for the whole integration-test assembly.
//
// WHY: previously every test class implemented IAsyncLifetime and started its
// OWN postgres:17-alpine container. Because xUnit creates a new test-class
// instance per test method, that meant ~one container start/stop PER TEST
// (102 containers in a full run). On top of that, helpers like
// AuthenticatedClient() rebuild the WebApplicationFactory host. Under that
// Docker resource pressure, host builds intermittently failed with
// "The entry point exited without ever building an IHost" — flaky, ~8/102.
//
// FIX: start ONE container for the entire assembly (ICollectionFixture) and
// give each test a freshly-named database inside it. EF's EnsureCreatedAsync
// creates the database + schema on first use, so per-test data isolation is
// preserved exactly as before — only the container churn is removed.

using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace AuthService.IntegrationTests;

/// <summary>
/// Owns a single PostgreSQL container shared across every integration test in
/// the assembly. Hand out a unique connection string per test via
/// <see cref="NewDatabaseConnectionString"/> to keep tests isolated.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:17-alpine")
        .WithDatabase("snapaccount_it")
        .WithUsername("postgres")
        .WithPassword("postgres_it")
        .Build();

    public Task InitializeAsync() => _container.StartAsync();

    public async Task DisposeAsync() => await _container.DisposeAsync();

    /// <summary>
    /// Returns a connection string pointing at a brand-new, uniquely-named
    /// database inside the shared container. The database itself is created
    /// lazily by EF's EnsureCreatedAsync on first use, so callers keep using
    /// the same EnsureCreated pattern they used with a dedicated container.
    /// </summary>
    public string NewDatabaseConnectionString()
    {
        var builder = new NpgsqlConnectionStringBuilder(_container.GetConnectionString())
        {
            Database = "it_" + Guid.NewGuid().ToString("N"),
            // Pooling OFF: with one shared container, lingering per-database connection
            // pools (notably from derived WebApplicationFactory hosts that aren't disposed)
            // accumulate idle connections and exhaust Postgres' max_connections
            // ("53300: too many clients already"). Disabling pooling closes each
            // connection immediately; for sequential integration tests the cost is trivial.
            Pooling = false,
        };
        return builder.ConnectionString;
    }
}

/// <summary>
/// Binds <see cref="PostgresFixture"/> to a single xUnit collection so all
/// integration test classes share one container. Classes opt in with
/// <c>[Collection("integration")]</c> and a constructor taking the fixture.
/// </summary>
[CollectionDefinition("integration")]
public sealed class IntegrationCollection : ICollectionFixture<PostgresFixture>
{
}
