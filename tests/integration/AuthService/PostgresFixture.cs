// Shared PostgreSQL Testcontainer for the whole integration-test assembly.
//
// Now backed by MigratedPostgresFixture: it applies the real database/migrations/*.sql to a
// template database ONCE, then hands out an instant clone per test via NewDatabaseConnectionString().
// The returned DB already has the full production schema + seed data, so tests get the exact
// production schema (not the partial EF EnsureCreated model). Existing EnsureCreatedAsync() calls
// in test setup become harmless no-ops (the database already has all tables).

using SnapAccount.IntegrationTests.Shared;
using Xunit;

namespace AuthService.IntegrationTests;

/// <summary>
/// Owns a single migrated PostgreSQL container shared across every integration test in the
/// assembly. Hand out a unique migrated database per test via
/// <see cref="MigratedPostgresFixture.NewDatabaseConnectionString"/>.
/// </summary>
public sealed class PostgresFixture : MigratedPostgresFixture
{
}

/// <summary>
/// Binds <see cref="PostgresFixture"/> to a single xUnit collection so all integration test
/// classes share one migrated container. Classes opt in with <c>[Collection("integration")]</c>.
/// </summary>
[CollectionDefinition("integration")]
public sealed class IntegrationCollection : ICollectionFixture<PostgresFixture>
{
}
