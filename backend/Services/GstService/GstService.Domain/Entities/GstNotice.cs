using GstService.Domain.Enums;
using GstService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

/// <summary>
/// A GST notice received from the GST portal (GSTN or tax authority).
/// Status machine: RECEIVED → UNDER_REVIEW → RESPONDED → CLOSED (also ESCALATED).
/// P6-HANDOFF-13: canonical table is gst.notices (migration 021).
/// P6-HANDOFF-14: AttachmentsJson / ResponseAttachmentsJson stores GCS URI metadata array only —
///   never base64 bytes. Format: [{gcs_uri, filename, content_type, size_bytes, uploaded_at, uploaded_by}].
/// GAP-108 (migration 084): FormType taxonomy, StatutoryDeadline engine, AppealStage tracking.
/// </summary>
public class GstNotice : BaseAuditableEntity
{
    /// <summary>Organisation that received this notice.</summary>
    public Guid OrganizationId { get; private set; }

    /// <summary>Unique notice reference number from the GST portal.</summary>
    public string NoticeNumber { get; private set; } = string.Empty;

    /// <summary>Type of notice (e.g. ASMT-10, DRC-01, etc.).</summary>
    public string NoticeType { get; private set; } = string.Empty;

    /// <summary>
    /// GAP-108: Canonical form-type taxonomy — ASMT_10 / DRC_01 / DRC_01A / DRC_01B /
    /// DRC_01C / ADT_01 / OTHER. Stored as varchar(20). Default: OTHER.
    /// </summary>
    public GstNoticeFormType FormType { get; private set; } = GstNoticeFormType.OTHER;

    /// <summary>Authority that issued the notice.</summary>
    public string? IssuedBy { get; private set; }

    /// <summary>Date the notice was issued.</summary>
    public DateOnly IssuedDate { get; private set; }

    /// <summary>
    /// GAP-108: Statutory response deadline computed from IssuedDate + form-type rules.
    /// Null until deadline engine runs (SetStatutoryDeadline). Config-driven per FY.
    /// </summary>
    public DateOnly? StatutoryDeadline { get; private set; }

    /// <summary>
    /// GAP-108: Operator-set explicit deadline (from notice text) that overrides the
    /// statutory computation when present. StatutoryDeadline is preserved for audit.
    /// </summary>
    public DateOnly? DueDate { get; private set; }

    /// <summary>
    /// GAP-108: True when DueDate was explicitly set by an operator (overriding the
    /// statutory computation). False = statutory deadline is authoritative.
    /// </summary>
    public bool DeadlineOverridden { get; private set; }

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

    // ── GAP-108: GSTAT Appeal Tracking ─────────────────────────────────────

    /// <summary>
    /// GAP-108: Current stage in the GSTAT appeal pipeline.
    /// NONE → REPLY_FILED → ORDER_RECEIVED → APPEAL_FILED → GSTAT_PENDING → RESOLVED.
    /// Stored as varchar(20); default NONE.
    /// </summary>
    public GstNoticeAppealStage AppealStage { get; private set; } = GstNoticeAppealStage.NONE;

    /// <summary>
    /// GAP-108: Deadline by which an appeal must be filed (90 days from order date, extendable).
    /// Set when AppealStage transitions to ORDER_RECEIVED.
    /// </summary>
    public DateOnly? AppealDeadline { get; private set; }

    /// <summary>
    /// GAP-108: Flag — true when AppealStage is ORDER_RECEIVED and the GSTAT backlog-appeal
    /// deadline (config-driven; currently 2026-06-30) has not been acted upon.
    /// This is a computed property — not stored separately; derived from AppealStage + AppealDeadline + config.
    /// The application layer exposes this in DTOs after comparing against config date.
    /// </summary>
    public bool IsGstatBacklogFlagged { get; private set; }

    private GstNotice() { }

    /// <summary>Creates a new notice in RECEIVED status and raises <see cref="GstNoticeReceivedEvent"/>.</summary>
    public static GstNotice Create(
        Guid orgId,
        string noticeNumber,
        string noticeType,
        DateOnly issuedDate,
        DateOnly? dueDate = null,
        string? description = null,
        GstNoticeFormType formType = GstNoticeFormType.OTHER)
    {
        var notice = new GstNotice
        {
            OrganizationId = orgId,
            NoticeNumber = noticeNumber,
            NoticeType = noticeType,
            FormType = formType,
            IssuedDate = issuedDate,
            DueDate = dueDate,
            DeadlineOverridden = dueDate.HasValue,
            Description = description
        };
        notice.AddDomainEvent(new GstNoticeReceivedEvent(notice.Id, orgId, noticeType, dueDate));
        return notice;
    }

    /// <summary>Sets the issuing authority.</summary>
    public void SetIssuedBy(string? issuedBy) => IssuedBy = issuedBy;

    /// <summary>
    /// GAP-108: Sets the form type taxonomy. Can be called during creation or updated later
    /// when the exact form type is parsed from the notice document.
    /// </summary>
    public void SetFormType(GstNoticeFormType formType)
    {
        FormType = formType;
    }

    /// <summary>
    /// GAP-108: Sets the statutory deadline computed by the deadline engine.
    /// Does NOT override an operator-set DueDate (DeadlineOverridden == true).
    /// </summary>
    public void SetStatutoryDeadline(DateOnly computedDeadline)
    {
        StatutoryDeadline = computedDeadline;
        // If no operator override, set DueDate = statutory for backward compat with
        // existing GET /gst/notices endpoints that return DueDate.
        if (!DeadlineOverridden)
            DueDate = computedDeadline;
    }

    /// <summary>
    /// GAP-108: Operator explicitly sets a deadline extracted from the notice text.
    /// This wins over the statutory computation. The statutory value is preserved for audit.
    /// </summary>
    public void OverrideDeadline(DateOnly explicitDeadline)
    {
        DueDate = explicitDeadline;
        DeadlineOverridden = true;
    }

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
        // Promote appeal stage if reply was pending
        if (AppealStage == GstNoticeAppealStage.NONE)
            AppealStage = GstNoticeAppealStage.REPLY_FILED;
    }

    /// <summary>Closes the notice after resolution.</summary>
    public void Close() => Status = "CLOSED";

    /// <summary>Escalates the notice.</summary>
    public void Escalate() => Status = "ESCALATED";

    // ── GAP-108: GSTAT Appeal Stage Transitions ─────────────────────────────

    /// <summary>
    /// GAP-108: Records that the adjudicating authority has passed an order.
    /// Sets AppealStage to ORDER_RECEIVED and computes the appeal deadline
    /// (90 days from order date for CGST Act s.107; adjust if notice specifies otherwise).
    /// </summary>
    /// <param name="orderDate">Date the order was received.</param>
    /// <param name="appealWindowDays">Days to appeal from order date (default 90).</param>
    public void RecordOrderReceived(DateOnly orderDate, int appealWindowDays = 90)
    {
        AppealStage = GstNoticeAppealStage.ORDER_RECEIVED;
        AppealDeadline = orderDate.AddDays(appealWindowDays);
    }

    /// <summary>
    /// GAP-108: Records that an appeal has been filed before the Appellate Authority (First Appeal).
    /// </summary>
    public void RecordAppealFiled()
    {
        AppealStage = GstNoticeAppealStage.APPEAL_FILED;
    }

    /// <summary>
    /// GAP-108: Records that the matter has been admitted/is pending before GSTAT.
    /// </summary>
    public void RecordGstatPending()
    {
        AppealStage = GstNoticeAppealStage.GSTAT_PENDING;
    }

    /// <summary>
    /// GAP-108: Marks the entire appeal chain as resolved.
    /// </summary>
    public void ResolveAppeal()
    {
        AppealStage = GstNoticeAppealStage.RESOLVED;
        Status = "CLOSED";
    }

    /// <summary>
    /// GAP-108: Updates the GSTAT backlog flag based on the config-driven backlog deadline.
    /// Called by the application layer after comparing AppealStage + AppealDeadline against config.
    /// </summary>
    public void SetGstatBacklogFlag(bool flagged)
    {
        IsGstatBacklogFlagged = flagged;
    }

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
