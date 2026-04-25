using SnapAccount.Shared.Domain;

namespace GstService.Domain.Events;

public sealed record GstNoticeReceivedEvent(
    Guid GstNoticeId,
    Guid OrganizationId,
    string NoticeType,
    DateOnly? DueDate) : DomainEvent;
