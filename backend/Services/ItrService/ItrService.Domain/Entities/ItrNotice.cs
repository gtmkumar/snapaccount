using SnapAccount.Shared.Domain;

namespace ItrService.Domain.Entities;

/// <summary>
/// An Income Tax notice linked to a specific filing.
/// Status: RECEIVED | UNDER_REVIEW | RESPONDED | CLOSED.
/// </summary>
public class ItrNotice : BaseAuditableEntity
{
    /// <summary>Filing this notice relates to.</summary>
    public Guid FilingId { get; private set; }

    /// <summary>Assessee who received this notice.</summary>
    public Guid AssesseeId { get; private set; }

    /// <summary>IT department notice reference number.</summary>
    public string NoticeNumber { get; private set; } = string.Empty;

    /// <summary>Notice type: 143(1), 143(2), 148, 156, etc.</summary>
    public string NoticeType { get; private set; } = string.Empty;

    /// <summary>Notice subject.</summary>
    public string? Subject { get; private set; }

    /// <summary>Date of issue.</summary>
    public DateOnly IssuedDate { get; private set; }

    /// <summary>Response deadline.</summary>
    public DateOnly? DueDate { get; private set; }

    /// <summary>Current status.</summary>
    public string Status { get; private set; } = "RECEIVED";

    /// <summary>GCS URI metadata JSON for uploaded notice PDF.</summary>
    public string? AttachmentsJson { get; private set; }

    /// <summary>GCS URI metadata JSON for response documents.</summary>
    public string? ResponseAttachmentsJson { get; private set; }

    /// <summary>CA assigned to respond.</summary>
    public Guid? AssignedCaId { get; private set; }

    /// <summary>Response text.</summary>
    public string? ResponseText { get; private set; }

    /// <summary>When the response was filed.</summary>
    public DateTime? RespondedAt { get; private set; }

    /// <summary>Who filed the response.</summary>
    public Guid? RespondedBy { get; private set; }

    /// <summary>DPDP anonymization.</summary>
    public DateTime? AnonymizedAt { get; private set; }

    /// <summary>Anonymization reason.</summary>
    public string? AnonymizationReason { get; private set; }

    private ItrNotice() { }

    /// <summary>Creates a new ITR notice.</summary>
    public static ItrNotice Create(
        Guid filingId, Guid assesseeId,
        string noticeNumber, string noticeType,
        DateOnly issuedDate, DateOnly? dueDate = null, string? subject = null)
    {
        return new ItrNotice
        {
            FilingId = filingId,
            AssesseeId = assesseeId,
            NoticeNumber = noticeNumber,
            NoticeType = noticeType,
            IssuedDate = issuedDate,
            DueDate = dueDate,
            Subject = subject
        };
    }

    /// <summary>Attaches GCS URI metadata for uploaded notice PDF.</summary>
    public void SetAttachments(string attachmentsJson)
    {
        AttachmentsJson = attachmentsJson;
        Status = "UNDER_REVIEW";
    }

    /// <summary>Assigns the notice to a CA.</summary>
    public void AssignToCa(Guid caId)
    {
        AssignedCaId = caId;
        if (Status == "RECEIVED") Status = "UNDER_REVIEW";
    }

    /// <summary>Files a response to the notice.</summary>
    public void FileResponse(Guid respondedBy, string? responseText, string? responseAttachmentsJson)
    {
        Status = "RESPONDED";
        RespondedBy = respondedBy;
        RespondedAt = DateTime.UtcNow;
        ResponseText = responseText;
        ResponseAttachmentsJson = responseAttachmentsJson;
    }

    /// <summary>Closes the notice.</summary>
    public void Close() => Status = "CLOSED";

    /// <summary>DPDP: anonymize PII fields.</summary>
    public void Anonymize(string reason)
    {
        ResponseText = null;
        AttachmentsJson = null;
        ResponseAttachmentsJson = null;
        AnonymizedAt = DateTime.UtcNow;
        AnonymizationReason = reason;
    }
}
