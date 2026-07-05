namespace AuthService.Application.Interfaces;

/// <summary>
/// Schedules a background export job that produces the per-user DPDP data bundle.
/// Implemented in Infrastructure using Hangfire so that the Application layer
/// has no direct dependency on the job scheduling library.
/// </summary>
public interface IDataExportJobScheduler
{
    /// <summary>
    /// Enqueues the export job and returns the Hangfire job ID for traceability.
    /// </summary>
    /// <param name="requestId">The <c>DataExportRequest.Id</c> to update on completion.</param>
    /// <param name="userId">The user whose data should be exported.</param>
    string Schedule(Guid requestId, Guid userId);
}
