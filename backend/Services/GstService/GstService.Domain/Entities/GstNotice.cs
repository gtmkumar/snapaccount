using SnapAccount.Shared.Domain;
using GstService.Domain.Events;

namespace GstService.Domain.Entities;

/// <summary>
/// A GST notice received from the GST portal (GSTN or tax authority).
/// Status machine: RECEIVED → UNDER_REVIEW → RESPONDED → CLOSED (also ESCALATED).
/// P6-HANDOFF-13: canonical table is gst.notices (migration 021).
/// P6-HANDOFF-14: AttachmentsJson / ResponseAttachmentsJson stores GCS URI metadata array only —
///   never base64 bytes. Format: [{gcs_uri, filename, content_type, size_bytes, uploaded_at, uploaded_by}].
/// </summary>
public class GstNotice : BaseAuditableEntity
{
    /// <summary>Organisation that received this notice.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>Unique notice reference number from the GST portal.</summary>
    public string NoticeNumber { get; private set; } = string.Empty;

    /// <summary>Type of notice (e.g. ASMT-10, DRC-01, etc.).</summary>
    public string NoticeType { get; private set; } = string.Empty;

    /// <summary>Authority that issued the notice.</summary>
    public string? IssuedBy { get; private set; }

    /// <summary>Date the notice was issued.</summary>
    public DateOnly IssuedDate { get; private set; }

    /// <summary>Response due date.</summary>
    public DateOnly? DueDate { get; private set; }

    /// <summary>Notice subject or description.</summary>
    public string? Description { get; private set; }

    /// <summary>
    /// Current status: RECEIVED | UNDER_REVIEW | RESPONDED | CLOSED | ESCALATED.
    /// </summary>
    public string Status { get; private set; } = "RECEIVED";

    /// <summary>
    /// P6-HANDOFF-14: GCS URI metadata for attached PDFs — array of
    /// {gcs_uri, filename, content_type, size_bytes, uploaded_at, uploaded_by}.
    /// Never stores raw bytes.
    /// </summary>
    public string? AttachmentsJson { get; private set; }

    /// <summary>GCS URI metadata for response documents uploaded by the CA/user.</summary>
    public string? ResponseAttachmentsJson { get; private set; }

    /// <summary>CA user assigned to respond to this notice.</summary>
    public Guid? AssignedCaId { get; private set; }

    /// <summary>Timestamp when the response was filed.</summary>
    public DateTime? RespondedAt { get; private set; }

    /// <summary>User who filed the response.</summary>
    public Guid? RespondedBy { get; private set; }

    private GstNotice() { }

    /// <summary>Creates a new notice in RECEIVED status and raises <see cref="GstNoticeReceivedEvent"/>.</summary>
    public static GstNotice Create(
        Guid orgId,
        string noticeNumber,
        string noticeType,
        DateOnly issuedDate,
        DateOnly? dueDate = null,
        string? description = null)
    {
        var notice = new GstNotice
        {
            OrganizationId = orgId,
            NoticeNumber = noticeNumber,
            NoticeType = noticeType,
            IssuedDate = issuedDate,
            DueDate = dueDate,
            Description = description
        };
        notice.AddDomainEvent(new GstNoticeReceivedEvent(notice.Id, orgId, noticeType, dueDate));
        return notice;
    }

    /// <summary>Sets the issuing authority.</summary>
    public void SetIssuedBy(string? issuedBy) => IssuedBy = issuedBy;

    /// <summary>
    /// Moves the notice to UNDER_REVIEW and stores GCS URI metadata for the uploaded attachment.
    /// P6-HANDOFF-14: attachmentMetadataJson must be a JSON array of URI metadata objects.
    /// </summary>
    public void MarkUnderReview(string attachmentMetadataJson)
    {
        Status = "UNDER_REVIEW";
        AttachmentsJson = attachmentMetadataJson;
    }

    /// <summary>
    /// Assigns the notice to a CA for response.
    /// Emits <see cref="GstNoticeAssignedToCaEvent"/> for notification routing.
    /// </summary>
    public void AssignToCa(Guid caId)
    {
        AssignedCaId = caId;
        if (Status == "RECEIVED") Status = "UNDER_REVIEW";
        AddDomainEvent(new GstNoticeAssignedToCaEvent(Id, OrganizationId, caId));
    }

    /// <summary>Files a response — moves status to RESPONDED.</summary>
    public void FileResponse(Guid respondedBy, string? responseAttachmentMetadataJson = null)
    {
        Status = "RESPONDED";
        RespondedBy = respondedBy;
        RespondedAt = DateTime.UtcNow;
        ResponseAttachmentsJson = responseAttachmentMetadataJson;
    }

    /// <summary>Closes the notice after resolution.</summary>
    public void Close() => Status = "CLOSED";

    /// <summary>Escalates the notice.</summary>
    public void Escalate() => Status = "ESCALATED";

    /// <summary>
    /// SEC-040 / DPDP Act 2023: anonymizes the respondent reference on an org-shared notice.
    /// Called when the user who filed the response has exercised the right to erasure.
    /// The notice itself is retained for the org's compliance records — only the personal
    /// reference to the respondent user is cleared.
    /// </summary>
    public void AnonymizeRespondent()
    {
        RespondedBy = null;
    }
}
