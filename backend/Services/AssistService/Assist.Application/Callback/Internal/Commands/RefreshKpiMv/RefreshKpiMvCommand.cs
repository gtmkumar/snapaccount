using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Internal.Commands.RefreshKpiMv;

/// <summary>
/// DG-INFRA-04: Refreshes the <c>callback.kpi_daily_snapshot</c> materialized view.
/// Triggered by:
///   (a) POST /callbacks/internal/refresh-kpi-mv  — direct Cloud Scheduler HTTP call.
///   (b) <c>CallbackRecurringJobsSubscriber</c>   — Pub/Sub job_type=CALLBACK_KPI_MV_REFRESH.
///
/// The CONCURRENTLY keyword requires <c>uq_kpi_daily_snapshot_org_date</c> unique index
/// which is asserted by database migrations 067 and 073.
///
/// No <see cref="RequiresPermissionAttribute"/> — the endpoint is secured by an internal
/// shared token rather than RBAC (Cloud Scheduler cannot hold a Firebase JWT).
/// </summary>
public record RefreshKpiMvCommand : ICommand;

/// <summary>Validates <see cref="RefreshKpiMvCommand"/> — no fields to validate.</summary>
public sealed class RefreshKpiMvCommandValidator : AbstractValidator<RefreshKpiMvCommand>
{
    public RefreshKpiMvCommandValidator() { }
}
