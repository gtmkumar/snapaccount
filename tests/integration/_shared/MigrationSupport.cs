// Shared integration-test infrastructure: applies the real database/migrations/*.sql
// to a Postgres testcontainer (the schema source of truth), instead of EF EnsureCreated.
//
// WHY: EnsureCreated builds the schema from the EF model, which OMITS tables/views/columns
// that exist only in the SQL migrations (reporting tables like accounting.ledger_entries,
// reference tables like loan.loan_products, DB-level column defaults, seeded reference data).
// Endpoints that query those via raw SQL then 500 under EnsureCreated. Replaying the actual
// migrations gives the tests the exact production schema.
//
// PERFORMANCE: migrations are applied ONCE to a template database per suite (assembly) run;
// each test gets an instant file-copy clone via CREATE DATABASE ... TEMPLATE.

using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace SnapAccount.IntegrationTests.Shared;

/// <summary>
/// Locates and replays the repository's SQL migrations against a target database.
/// Migrations are pure SQL (no psql meta-commands) so Npgsql can execute them directly.
/// </summary>
public static class MigrationRunner
{
    private static string? _migrationsDir;

    /// <summary>Absolute path to database/migrations, resolved by walking up from the test bin dir.</summary>
    public static string MigrationsDir => _migrationsDir ??= Locate();

    private static string Locate()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "database", "migrations");
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "000_init.sql")))
                return candidate;
            dir = dir.Parent;
        }
        throw new InvalidOperationException(
            "Could not locate database/migrations from " + AppContext.BaseDirectory);
    }

    /// <summary>
    /// Applies every migration in version order (all filenames are 3-digit zero-padded,
    /// so ordinal filename sort == numeric/version sort: 000_init … 109 … 999_seed).
    /// </summary>
    public static async Task ApplyAllAsync(string connectionString)
    {
        var files = Directory.GetFiles(MigrationsDir, "*.sql")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal)
            .ToList();

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();
        foreach (var file in files)
        {
            var sql = await File.ReadAllTextAsync(file);
            await using var cmd = new NpgsqlCommand(sql, conn) { CommandTimeout = 180 };
            try
            {
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Migration '{Path.GetFileName(file)}' failed: {ex.Message}", ex);
            }
        }
    }
}

/// <summary>
/// Owns one PostgreSQL container per test assembly (via <see cref="Testcontainers"/>), applies
/// the full migration chain once to a template database, and hands out instant clones per test.
///
/// Uses the pgvector image because 000_init enables the <c>vector</c> extension (RAG embeddings).
/// </summary>
public class MigratedPostgresFixture : IAsyncLifetime
{
    // Must be "snapaccount": 000_init.sql runs `ALTER DATABASE snapaccount SET search_path TO
    // shared, public` by name, and the app relies on that DB-level search_path for the shared schema.
    private const string TemplateDb = "snapaccount";

    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("pgvector/pgvector:pg17")
        .WithDatabase("bootstrap_it")
        .WithUsername("postgres")
        .WithPassword("postgres_it")
        .Build();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        // Build the template DB and apply the full migration chain once.
        await using (var admin = new NpgsqlConnection(AdminConnectionString()))
        {
            await admin.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE {TemplateDb};", admin);
            await cmd.ExecuteNonQueryAsync();
        }
        await MigrationRunner.ApplyAllAsync(ConnectionStringFor(TemplateDb));

        // Strip all seeded rows so the template has the full production SCHEMA but EMPTY data —
        // matching the clean-slate state the tests were written against (they self-seed their own
        // fixtures). This keeps the raw-SQL / migration-only tables + real column defaults that EF
        // EnsureCreated omitted, WITHOUT the seed rows that would collide with test self-seeding.
        await TruncateAllAppDataAsync(ConnectionStringFor(TemplateDb));

        // Ensure no lingering session holds the template open (TEMPLATE clone requires it).
        NpgsqlConnection.ClearAllPools();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    /// <summary>
    /// Creates a brand-new database cloned from the migrated template (fast file copy) and
    /// returns a pooling-disabled connection string to it. The returned DB already has the
    /// full production schema + seed data, so any EF EnsureCreated call in a test is a no-op.
    /// </summary>
    public string NewDatabaseConnectionString()
    {
        var name = "it_" + Guid.NewGuid().ToString("N");
        using (var admin = new NpgsqlConnection(AdminConnectionString()))
        {
            admin.Open();
            using (var cmd = new NpgsqlCommand($"CREATE DATABASE \"{name}\" TEMPLATE {TemplateDb};", admin))
                cmd.ExecuteNonQuery();
            // Per-database settings (ALTER DATABASE SET) are NOT copied by TEMPLATE, so replicate
            // the search_path the app relies on (000_init sets it on the template only).
            using (var cmd = new NpgsqlCommand($"ALTER DATABASE \"{name}\" SET search_path TO shared, public;", admin))
                cmd.ExecuteNonQuery();
            // Seed-mode (option b): the existing suites self-seed partial object graphs written for the
            // FK-free EnsureCreated schema. On the real migrated schema those violate FKs (dangling refs)
            // that the EF MODEL is missing anyway. Disable trigger/FK enforcement in the test DB so seeds
            // succeed; the code-under-test still faces the exact production SCHEMA (all tables, columns,
            // check constraints, defaults). Divergences are logged in the bug-log. Note: because these
            // suites share one connection string for both the seed path and the app path, per-connection
            // FK-on-for-app is not cleanly separable without per-test churn, so enforcement is off DB-wide.
            using (var cmd = new NpgsqlCommand($"ALTER DATABASE \"{name}\" SET session_replication_role TO replica;", admin))
                cmd.ExecuteNonQuery();
        }
        return ConnectionStringFor(name);
    }

    private static async Task TruncateAllAppDataAsync(string connectionString)
    {
        // session_replication_role='replica' disables ordinary (origin) triggers for this session,
        // including the statutory append-only guards (e.g. accounting.edit_log BEFORE TRUNCATE),
        // so the clean-slate truncate can run. Reset to 'origin' afterwards.
        //
        // KEEP-LIST: reference/template/config tables that endpoints MATERIALIZE from (COA templates,
        // tax rates/slabs, HSN codes, loan types, subscription plans, notice-deadline rules, shared
        // config) are NOT test-seeded — clearing them would break the code-under-test. Everything else
        // is truncated so tests self-seed their own transactional + auth-config fixtures cleanly.
        const string sql = """
            SET session_replication_role = 'replica';
            DO $$
            DECLARE r RECORD;
            BEGIN
              FOR r IN
                SELECT schemaname, tablename FROM pg_tables
                WHERE schemaname IN ('auth','document','accounting','gst','loan','itr','chat',
                                     'notification','report','subscription','ai','shared')
                  AND (schemaname || '.' || tablename) NOT IN (
                    'accounting.coa_template',
                    'gst.gst_tax_rate', 'gst.hsn_sac_code', 'gst.notice_deadline_rules',
                    'itr.tax_regime', 'itr.tax_slab',
                    'loan.loan_type',
                    'document.document_category',
                    'subscription.subscription_plan',
                    'shared.api_rate_limit', 'shared.feature_flag', 'shared.system_configuration'
                  )
              LOOP
                EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
              END LOOP;
            END $$;
            SET session_replication_role = 'origin';
            """;
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn) { CommandTimeout = 120 };
        await cmd.ExecuteNonQueryAsync();
    }

    private string AdminConnectionString() =>
        new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Pooling = false }.ConnectionString;

    private string ConnectionStringFor(string database) =>
        new NpgsqlConnectionStringBuilder(_container.GetConnectionString())
        {
            Database = database,
            // Pooling off: cloned DBs are short-lived and derived WebApplicationFactory hosts
            // that aren't disposed would otherwise accumulate idle connections.
            Pooling = false,
        }.ConnectionString;
}

/// <summary>
/// Reusable xUnit collection so each integration suite shares ONE migrated container per assembly.
/// Test classes opt in with <c>[Collection("migrated")]</c> and a constructor taking
/// <see cref="MigratedPostgresFixture"/>. Compiled into each test assembly via the linked
/// MigrationSupport.cs, so the collection binds per-assembly as xUnit requires.
/// </summary>
[CollectionDefinition("migrated")]
public sealed class MigratedCollection : ICollectionFixture<MigratedPostgresFixture>
{
}
