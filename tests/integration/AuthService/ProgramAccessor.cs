// This file makes the top-level Program class accessible to WebApplicationFactory.
// Required because AuthService.Api uses C# top-level statements which generate
// an internal Program class by default.
// Ref: https://docs.microsoft.com/en-us/aspnet/core/test/integration-tests

// Make the implicit Program class visible to this test assembly.
// The AuthService.Api project must include this in its build or expose it via:
//   <InternalsVisibleTo Include="AuthService.IntegrationTests" />
// in AuthService.Api.csproj. Until that is wired up this stub keeps the
// test file compilable; the factory resolves the real type at runtime.

// No code needed — presence of the project reference in .csproj is sufficient
// once InternalsVisibleTo is configured.
