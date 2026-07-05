using AuthService.Application.ReferenceData.Commands.CreateReferenceData;
using AuthService.Application.ReferenceData.Commands.DeleteReferenceData;
using AuthService.Application.ReferenceData.Commands.UpdateReferenceData;
using AuthService.Application.ReferenceData.Queries.GetReferenceData;
using MediatR;
using SnapAccount.Shared.Api;
using SnapAccount.Shared.Domain;

namespace AuthService.Api.Endpoints;

/// <summary>
/// Increment 1.4 Phase A — Reference / lookup data management.
///
/// READ  (any authenticated user — drives dropdowns):
///   GET /auth/reference-data?category=STATE&amp;activeOnly=true
///
/// WRITE (platform.refdata.manage — SUPER_ADMIN):
///   POST   /auth/reference-data
///   PUT    /auth/reference-data/{id}
///   DELETE /auth/reference-data/{id}
/// </summary>
public sealed class ReferenceDataEndpoints : EndpointGroupBase
{
    public override string? GroupName => "/auth";

    public override void Map(RouteGroupBuilder group)
    {
        // GET /auth/reference-data
        group.MapGet("/reference-data", GetAll)
            .RequireAuthorization()
            .WithSummary(
                "List reference-data entries. Optional ?category= and ?activeOnly=true|false. " +
                "Defaults: all categories, activeOnly=true (dropdown-safe). " +
                "Pass activeOnly=false for the management screen.");

        // POST /auth/reference-data
        group.MapPost("/reference-data", Create)
            .RequireAuthorization()
            .WithSummary(
                "Create a new reference-data entry. Requires platform.refdata.manage. " +
                "category ∈ {LANGUAGE,USER_TYPE,GENDER,STATE,COUNTRY}. " +
                "STATE entries require a valid active COUNTRY parentCode.");

        // PUT /auth/reference-data/{id}
        group.MapPut("/reference-data/{id:guid}", Update)
            .RequireAuthorization()
            .WithSummary(
                "Update name, parentCode, sortOrder, or isActive. " +
                "category+code are immutable. Requires platform.refdata.manage.");

        // DELETE /auth/reference-data/{id}
        group.MapDelete("/reference-data/{id:guid}", Delete)
            .RequireAuthorization()
            .WithSummary(
                "Soft-delete a reference-data entry. Blocked (409) if the entry is " +
                "referenced by existing user/profile rows. Requires platform.refdata.manage.");
    }

    // GET /auth/reference-data
    private static async Task<IResult> GetAll(
        ISender sender, CancellationToken ct,
        string? category = null,
        bool activeOnly = true)
    {
        var result = await sender.Send(new GetReferenceDataQuery(category, activeOnly), ct);
        return result.IsSuccess ? Results.Ok(result.Value) : MapError(result.Error);
    }

    // POST /auth/reference-data
    private static async Task<IResult> Create(
        CreateReferenceDataRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new CreateReferenceDataCommand(
                req.Category, req.Code, req.Name, req.ParentCode, req.SortOrder ?? 0), ct);
        return result.IsSuccess
            ? Results.Created($"/auth/reference-data/{result.Value.Id}", result.Value)
            : MapError(result.Error);
    }

    // PUT /auth/reference-data/{id}
    private static async Task<IResult> Update(
        Guid id, UpdateReferenceDataRequest req, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(
            new UpdateReferenceDataCommand(id, req.Name, req.ParentCode, req.SortOrder, req.IsActive), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    // DELETE /auth/reference-data/{id}
    private static async Task<IResult> Delete(
        Guid id, ISender sender, CancellationToken ct)
    {
        var result = await sender.Send(new DeleteReferenceDataCommand(id), ct);
        return result.IsSuccess ? Results.NoContent() : MapError(result.Error);
    }

    private static IResult MapError(Error error) => error.Type switch
    {
        ErrorType.NotFound   => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Forbidden  => Results.Json(new { error = error.Message, code = error.Code }, statusCode: 403),
        ErrorType.Conflict   => Results.Conflict(new { error = error.Message, code = error.Code }),
        ErrorType.Validation => Results.BadRequest(new { error = error.Message, code = error.Code }),
        _                    => Results.Problem(error.Message),
    };
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

/// <summary>POST /auth/reference-data body.</summary>
internal record CreateReferenceDataRequest(
    string Category,
    string Code,
    string Name,
    string? ParentCode = null,
    int? SortOrder = null);

/// <summary>PUT /auth/reference-data/{id} body. All fields optional (null = no change).</summary>
internal record UpdateReferenceDataRequest(
    string? Name = null,
    string? ParentCode = null,
    int? SortOrder = null,
    bool? IsActive = null);
