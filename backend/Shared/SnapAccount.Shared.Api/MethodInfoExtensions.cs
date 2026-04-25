using System.Reflection;

namespace SnapAccount.Shared.Api;

/// <summary>
/// Extension methods on <see cref="MethodInfo"/> used by the endpoint group infrastructure.
/// Mirrors the Jason Taylor CleanArchitecture <c>MethodInfoExtensions</c> pattern.
/// </summary>
public static class MethodInfoExtensions
{
    /// <summary>
    /// Returns <c>true</c> when the method is a compiler-generated anonymous method
    /// (its name contains angle brackets typical of lambda lifting).
    /// </summary>
    public static bool IsAnonymous(this MethodInfo method)
    {
        var invalidChars = new[] { '<', '>' };
        return method.Name.Any(invalidChars.Contains);
    }
}
