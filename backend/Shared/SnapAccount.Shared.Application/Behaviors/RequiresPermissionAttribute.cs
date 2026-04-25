namespace SnapAccount.Shared.Application.Behaviors;

/// <summary>
/// Marks a MediatR command or query as requiring a specific permission.
/// Place on the Command or Query record/class to enforce RBAC at the pipeline level
/// via <c>PermissionBehavior</c> in each service.
/// </summary>
/// <example>
/// <code>
/// [RequiresPermission("gst.returns.approve")]
/// public record ApproveReturnCommand(Guid GstReturnId) : ICommand;
/// </code>
/// </example>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class RequiresPermissionAttribute(string permission) : Attribute
{
    /// <summary>The permission name required to execute this request.</summary>
    public string Permission { get; } = permission;
}
