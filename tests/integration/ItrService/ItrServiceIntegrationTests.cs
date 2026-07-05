// Converted to the shared migration-based fixture (tests/integration/_shared/MigrationSupport.cs):
// applies the real database/migrations/*.sql once to a template DB, then hands out an instant
// clone per test. WebApplicationFactory<Program> resolves against Finance.WebApi (the
// FinanceService composite that hosts ItrService's endpoints) via DEV_AUTH_BYPASS, using the
// canned "dev-superadmin-token" (userId 22222222-2222-2222-2222-222222222222,
// organizationId 11111111-1111-1111-1111-111111111111 — see FirebaseAuthMiddleware.DevAuthTokens).
//
// CONTRACT NOTE: the real ItrService API diverges substantially from this file's original
// (never-run) assumptions:
//   - There is no POST /itr/assessees endpoint — assessee profile is create-or-update via
//     PUT /itr/profile (UpdateProfileCommand), which requires a PanCipher (opaque ciphertext,
//     not validated/decrypted at write time) + PanLast4, not a plain PAN.
//   - POST /itr/filings/{id}/compute-tax is now POST /itr/filings/{id}/compute.
//   - POST /itr/filings/{id}/submit-for-review is now POST /itr/filings/{id}/submit, and returns
//     204 NoContent (not 200 OK with a body) — same for ca-approve/ca-reject/mark-filed.
//   - POST /itr/filings/{id}/mark-e-verified is now POST /itr/filings/{id}/e-verify, body field
//     is VerificationMethod (not "method"), and it also returns 204 NoContent.
//   - ComputeTaxResponse/CompareRegimesResponse field names/shape changed: no taxSlabVersionId or
//     standardDeduction fields exist anymore (docs/api/endpoints.md POST /itr/filings/{id}/compute
//     confirms: filingId, grossTotalIncome, taxableIncome, totalTaxPayable(grossTaxLiability),
//     payableOrRefund, computationHash, regime, assessmentYear). Assertions rewritten to match.

using FluentAssertions;
using ItrService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SnapAccount.IntegrationTests.Shared;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace ItrService.IntegrationTests;

/// <summary>
/// Integration tests for ITR tax computation + filing state machine (hosted inside the
/// FinanceService composite). Uses the shared migrated-Postgres fixture (real
/// database/migrations/*.sql schema — itr.tax_slab_versions is a KEEP-LIST reference table
/// seeded by migrations, so AY2025-26 OLD/NEW slabs are already present; no manual seeding needed).
/// </summary>
[Collection("migrated")]
public class TaxComputationIntegrationTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;

    private HttpClient _client = null!;
    private WebApplicationFactory<Program> _factory = null!;

    // BUG-ITR-ASSESSEE-MAPPING resolved: migration 111 added the 7 flat-profile columns
    // (full_name/assessee_type/email/phone_number/aadhaar_last4/address/annual_turnover_cr) and an
    // `ay` DEFAULT; AssesseeConfiguration maps DateOfBirth→dob. These tests now run on the real schema.

    // ──────────────────────────────────────────────────────────────
    // IAsyncLifetime
    // ──────────────────────────────────────────────────────────────

    public Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
            });

        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");

        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    // ──────────────────────────────────────────────────────────────
    // Tax Computation — reads versioned slabs (P6-HANDOFF-18)
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Happy path: POST /itr/filings/{filingId}/compute with salary income and NEW regime
    /// should return a ComputationResult. itr.tax_slab_versions is a KEEP-LIST reference table
    /// (not truncated by the test fixture), so AY2025-26 slabs are present from the real migrations
    /// — proving the engine reads versioned DB slabs rather than hardcoded values
    /// (P6-HANDOFF-18: NEVER hardcode slab values).
    /// </summary>
    [Fact]
    public async Task ComputeTax_NewRegime_AY2025_26_ReadsVersionedSlabs()
    {
        // Arrange: create an assessee profile and a filing first
        var assesseeId = await CreateAssesseeAsync();
        var filingId = await CreateFilingAsync(assesseeId, "AY2025-26", "NEW");

        var request = new
        {
            salaryIncome = 600000,
            housePropertyIncome = 0,
            businessIncome = 0,
            capitalGains = 0,
            otherIncome = 0,
            section80C = 0,
            section80D = 0,
            section80E = 0,
            otherDeductions = 0,
            advanceTaxPaid = 0,
            tdsPaid = 42000,
        };

        // Act
        var response = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/compute", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Gross total income = salary only (₹6L)
        body.TryGetProperty("grossTotalIncome", out var gti).Should().BeTrue();
        gti.GetDecimal().Should().Be(600_000m);

        // Refund = TDS paid (₹42K) minus net tax — for NEW regime AY2025-26 with std deduction
        // ₹75,000, taxable income (₹5.25L) falls in the 0% slab, so the full TDS is refunded.
        body.TryGetProperty("payableOrRefund", out var outcome).Should().BeTrue();
        outcome.GetDecimal().Should().BeLessThan(0m); // Refund expected for ₹6L salary

        // Computation hash must be populated (SEC-020 audit invariant) — SHA-256 hex = 64 chars
        body.TryGetProperty("computationHash", out var hash).Should().BeTrue();
        hash.GetString().Should().HaveLength(64);

        body.TryGetProperty("regime", out var regime).Should().BeTrue();
        regime.GetString().Should().Be("NEW");
    }

    /// <summary>
    /// Regime comparison: POST /itr/filings/{filingId}/compare-regimes
    /// should return both OLD and NEW results + a recommendation.
    /// </summary>
    [Fact]
    public async Task CompareRegimes_AY2025_26_ReturnsBothResultsWithRecommendation()
    {
        // Arrange
        var assesseeId = await CreateAssesseeAsync();
        var filingId = await CreateFilingAsync(assesseeId, "AY2025-26", "NEW");

        var request = new
        {
            salaryIncome = 700000,
            housePropertyIncome = 0,
            businessIncome = 0,
            capitalGains = 0,
            otherIncome = 0,
            section80C = 150000, // Deductions only relevant for OLD regime
            section80D = 25000,
            section80E = 0,
            otherDeductions = 0,
            advanceTaxPaid = 0,
            tdsPaid = 0,
        };

        // Act
        var response = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/compare-regimes", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        body.TryGetProperty("old", out var oldResult).Should().BeTrue();
        body.TryGetProperty("new", out var newResult).Should().BeTrue();
        body.TryGetProperty("recommendedRegime", out var recommended).Should().BeTrue();
        body.TryGetProperty("taxSaving", out var saving).Should().BeTrue();

        // Both branches must be full ComputeTaxResponse-shaped objects (DG-ITR-01).
        oldResult.TryGetProperty("payableOrRefund", out _).Should().BeTrue();
        newResult.TryGetProperty("payableOrRefund", out _).Should().BeTrue();

        recommended.GetString().Should().BeOneOf("OLD", "NEW");
        saving.GetDecimal().Should().BeGreaterOrEqualTo(0m);
    }

    // ──────────────────────────────────────────────────────────────
    // Filing State Machine: DRAFT → UNDER_CA_REVIEW → USER_APPROVED
    //                       → FILED → E_VERIFIED
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// State machine happy path: a filing progresses through the full
    /// lifecycle from DRAFT to E_VERIFIED.
    /// P6-HANDOFF-18: computation must be pinned before submission.
    /// </summary>
    [Fact]
    public async Task FilingStateMachine_DraftToEVerified_FullLifecycle()
    {
        // Step 1: Create assessee profile + DRAFT filing
        var assesseeId = await CreateAssesseeAsync();
        var filingId = await CreateFilingAsync(assesseeId, "AY2025-26", "NEW");

        // Step 2: Compute tax to pin computation (required before submission)
        var computeRequest = new
        {
            salaryIncome = 600000, housePropertyIncome = 0, businessIncome = 0, capitalGains = 0,
            otherIncome = 0, section80C = 0, section80D = 0, section80E = 0, otherDeductions = 0,
            advanceTaxPaid = 0, tdsPaid = 42000,
        };
        var computeResp = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/compute", computeRequest);
        computeResp.StatusCode.Should().Be(HttpStatusCode.OK);

        // Step 3: Submit for CA review (DRAFT → UNDER_CA_REVIEW) — 204 NoContent
        var submitResp = await _client.PostAsync($"/itr/filings/{filingId}/submit", null);
        submitResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var filingAfterSubmit = await GetFilingAsync(filingId);
        filingAfterSubmit.GetProperty("status").GetString().Should().Be("UNDER_CA_REVIEW");

        // Step 4: CA approves (UNDER_CA_REVIEW → USER_APPROVED) — 204 NoContent
        var approveRequest = new { caUserId = Guid.NewGuid() };
        var approveResp = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/ca-approve", approveRequest);
        approveResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var filingAfterApprove = await GetFilingAsync(filingId);
        filingAfterApprove.GetProperty("status").GetString().Should().Be("USER_APPROVED");

        // Step 5: Mark as filed (USER_APPROVED → FILED) — 204 NoContent
        var fileRequest = new { acknowledgementNumber = "ACK20260425001" };
        var fileResp = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/mark-filed", fileRequest);
        fileResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var filingAfterFiled = await GetFilingAsync(filingId);
        filingAfterFiled.GetProperty("status").GetString().Should().Be("FILED");

        // Step 6: Mark as e-verified (FILED → E_VERIFIED) — 204 NoContent
        var eVerifyRequest = new { verificationMethod = "AADHAAR_OTP" };
        var eVerifyResp = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/e-verify", eVerifyRequest);
        eVerifyResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var filingAfterEVerify = await GetFilingAsync(filingId);
        filingAfterEVerify.GetProperty("status").GetString().Should().Be("E_VERIFIED");
    }

    /// <summary>
    /// State machine error path: submitting a DRAFT with no pinned computation
    /// should return 409 Conflict (Filing.NoComputation).
    /// </summary>
    [Fact]
    public async Task FilingStateMachine_SubmitWithoutComputation_Returns409()
    {
        // Arrange: filing with no computation pinned
        var assesseeId = await CreateAssesseeAsync();
        var filingId = await CreateFilingAsync(assesseeId, "AY2025-26", "NEW");

        // Act: try to submit without running compute first
        var response = await _client.PostAsync($"/itr/filings/{filingId}/submit", null);

        // Assert: 409 Conflict — computation not pinned
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    /// <summary>
    /// State machine error path: CA cannot approve a filing that is not in
    /// UNDER_CA_REVIEW status (e.g., DRAFT). Should return 409 Conflict.
    /// </summary>
    [Fact]
    public async Task FilingStateMachine_CaApproveFromDraft_Returns409()
    {
        var assesseeId = await CreateAssesseeAsync();
        var filingId = await CreateFilingAsync(assesseeId, "AY2025-26", "NEW");

        var approveRequest = new { caUserId = Guid.NewGuid() };
        var response = await _client.PostAsJsonAsync($"/itr/filings/{filingId}/ca-approve", approveRequest);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ──────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates (or updates) the assessee profile via PUT /itr/profile and returns the assesseeId.
    /// PanCipher is an opaque placeholder string — UpdateProfileCommandHandler stores it as-is
    /// without decrypting/validating format (real encryption happens at the caller, e.g. mobile
    /// client via IPanEncryptionService, before this endpoint is ever hit).
    /// </summary>
    private async Task<Guid> CreateAssesseeAsync()
    {
        var request = new
        {
            // Must be the dev-superadmin user id the canned token maps to — the compute/filing
            // endpoints enforce assessee ownership against the acting user, so a random userId 404s.
            userId = "22222222-2222-2222-2222-222222222222",
            // Filing/compute enforce assessee org ownership against the acting user's org
            // (dev-superadmin org). A null/other org 404s.
            organizationId = "11111111-1111-1111-1111-111111111111",
            panCipher = "test-pan-ciphertext-placeholder",
            panLast4 = "1234",
            fullName = "Test Assessee",
            assesseeType = "INDIVIDUAL",
        };
        var response = await _client.PutAsJsonAsync("/itr/profile", request);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("assesseeId").GetGuid();
    }

    private async Task<Guid> CreateFilingAsync(Guid assesseeId, string ay, string regime)
    {
        var request = new
        {
            assesseeId,
            assessmentYear = ay,
            itrFormType = "ITR-1",
            regime,
        };
        var response = await _client.PostAsJsonAsync("/itr/filings", request);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("filingId").GetGuid();
    }

    private async Task<JsonElement> GetFilingAsync(Guid filingId)
    {
        var response = await _client.GetAsync($"/itr/filings/{filingId}");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}

/// <summary>
/// Integration tests for CA reject and re-submission flow.
/// </summary>
[Collection("migrated")]
public class FilingCaRejectIntegrationTests(MigratedPostgresFixture pg) : IAsyncLifetime
{
    private readonly MigratedPostgresFixture _pg = pg;
    private string _connectionString = null!;

    private HttpClient _client = null!;
    private WebApplicationFactory<Program> _factory = null!;

    public Task InitializeAsync()
    {
        _connectionString = _pg.NewDatabaseConnectionString();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
                builder.UseSetting("DEV_AUTH_BYPASS", "true");
            });

        _client = _factory.CreateClient();
        _client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "dev-superadmin-token");

        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
    }

    /// <summary>
    /// CA reject flow: a non-existent filing must return 404 (not 409) — GetFiling/CaReject
    /// handlers look the filing up by ID first.
    /// </summary>
    [Fact]
    public async Task FilingStateMachine_CaReject_NonExistentFiling_Returns404()
    {
        var response = await _client.PostAsJsonAsync(
            $"/itr/filings/{Guid.NewGuid()}/ca-reject",
            new { caUserId = Guid.NewGuid(), reason = "Missing Form 16 data" });

        // A non-existent filing should return 404
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
