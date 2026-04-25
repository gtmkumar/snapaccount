namespace SnapAccount.Shared.Api;

/// <summary>
/// Base class for all SnapAccount Minimal API endpoint groups.
/// Follows the Jason Taylor CleanArchitecture pattern: each feature creates a class
/// inheriting <see cref="EndpointGroupBase"/> and overrides <see cref="Map"/> to register routes.
/// The <see cref="WebApplicationExtensions.MapEndpoints"/> extension auto-discovers and registers
/// all subclasses in the service assembly.
///
/// <para>
/// <b>Route prefix behaviour:</b> If <see cref="GroupName"/> starts with <c>/</c>
/// it is treated as an absolute path and used verbatim (no <c>/api/</c> prefix is added).
/// Otherwise, <c>/api/{GroupName}</c> is used. This preserves existing service routes
/// that were established before the JT refactor.
/// </para>
/// </summary>
public abstract class EndpointGroupBase
{
    /// <summary>
    /// Route prefix for this group.
    /// <list type="bullet">
    ///   <item>Starts with <c>/</c>: used verbatim (e.g. <c>/auth</c> → <c>/auth</c>).</item>
    ///   <item>Does not start with <c>/</c>: prefixed with <c>/api/</c> (e.g. <c>Users</c> → <c>/api/Users</c>).</item>
    /// </list>
    /// Defaults to the class name without <c>/api/</c> prefix when null.
    /// </summary>
    public virtual string? GroupName { get; }

    /// <summary>
    /// Map all routes in this endpoint group onto the provided <paramref name="groupBuilder"/>.
    /// The group is already prefixed according to <see cref="GroupName"/> rules.
    /// </summary>
    public abstract void Map(RouteGroupBuilder groupBuilder);
}
