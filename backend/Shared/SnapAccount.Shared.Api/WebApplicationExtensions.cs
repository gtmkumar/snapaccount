using System.Reflection;

namespace SnapAccount.Shared.Api;

/// <summary>
/// Extension methods for <see cref="WebApplication"/> that auto-discover and register
/// all <see cref="EndpointGroupBase"/> subclasses in the calling assembly.
/// Called once in <c>Program.cs</c> via <c>app.MapEndpoints()</c>.
/// </summary>
public static class WebApplicationExtensions
{
    private static RouteGroupBuilder MapGroup(this WebApplication app, EndpointGroupBase group)
    {
        var groupName = group.GroupName ?? group.GetType().Name;

        // If GroupName starts with '/', treat it as an absolute path — do NOT prepend /api/.
        // This preserves pre-refactor service routes (e.g. /auth, /gst, /documents).
        var routePrefix = groupName.StartsWith('/') ? groupName : $"/api/{groupName}";

        return app
            .MapGroup(routePrefix)
            .WithGroupName(groupName.TrimStart('/'))
            .WithTags(groupName.TrimStart('/'));
    }

    /// <summary>
    /// Discovers all <see cref="EndpointGroupBase"/> subclasses in the specified
    /// <paramref name="assembly"/> (defaults to the calling assembly), instantiates each,
    /// and calls <see cref="EndpointGroupBase.Map"/> on a route group.
    /// </summary>
    public static WebApplication MapEndpoints(this WebApplication app, Assembly? assembly = null)
    {
        var endpointGroupType = typeof(EndpointGroupBase);
        var targetAssembly = assembly ?? Assembly.GetCallingAssembly();

        var endpointGroupTypes = targetAssembly.GetExportedTypes()
            .Where(t => t.IsSubclassOf(endpointGroupType) && !t.IsAbstract);

        foreach (var type in endpointGroupTypes)
        {
            if (Activator.CreateInstance(type) is EndpointGroupBase instance)
            {
                instance.Map(app.MapGroup(instance));
            }
        }

        return app;
    }
}
