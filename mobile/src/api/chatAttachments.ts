/**
 * Chat attachment client — DG-CHAT-04.
 *
 * The backend stores attachments opaquely as a JSON STRING on the message
 * (ChatMessage.AttachmentsJson — see SendMessageCommand.cs). It does not parse
 * or validate the shape, so the clients (mobile + admin) own the contract. This
 * module defines that contract and the helpers to populate it:
 *
 *   - Camera / photo-library captures are pushed through the SAME GCS pipeline
 *     the Document Vault uses (POST /documents/upload → { documentId, storagePath }),
 *     so a chat attachment is always a first-class, org-scoped, retained document
 *     (DPDP 7-year retention) rather than an orphaned blob.
 *   - "Share from Document Vault" references an EXISTING document by id — no
 *     re-upload — via GET /documents.
 *
 * SECURITY: no attachment metadata is sensitive-auth material, so nothing here
 * touches Expo SecureStore (reserved for auth tokens). File bytes are streamed
 * straight to the backend over the authenticated apiClient.
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Attachment contract (serialized into ChatMessage.attachmentsJson)
// ─────────────────────────────────────────────────────────────────────────────

/** Where the attachment originated — drives the UI affordance, not the backend. */
export type ChatAttachmentSource = 'capture' | 'gallery' | 'vault';

/**
 * One attachment entry. `attachmentsJson` on a message is the JSON-encoded array
 * of these. All entries reference a persisted Document (documentId + storagePath),
 * so a recipient (mobile or admin) can resolve a viewable URL via the document
 * APIs regardless of which client sent it.
 */
export interface ChatAttachment {
  /** Persisted DocumentService id — the canonical reference. */
  documentId: string;
  /** GCS storage path returned by the upload (admin/mobile resolve a signed URL from this). */
  storagePath: string;
  /** Display name. */
  fileName: string;
  /** MIME type (e.g. image/jpeg, application/pdf). */
  mimeType: string;
  /** Size in bytes when known. */
  sizeBytes?: number;
  /** Origin affordance (capture | gallery | vault). */
  source: ChatAttachmentSource;
}

/** Max attachments per message — mirrors the admin spec (§3.3 multi-select, max 10). */
export const MAX_CHAT_ATTACHMENTS = 10;

/**
 * Serialize attachments for the message wire (`attachmentsJson`). Returns
 * `undefined` for an empty list so the field is omitted entirely.
 */
export function serializeAttachments(
  attachments: ChatAttachment[],
): string | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return JSON.stringify(attachments);
}

/** Parse a message's `attachmentsJson` back into attachments (tolerant of bad data). */
export function parseAttachments(
  attachmentsJson: string | null | undefined,
): ChatAttachment[] {
  if (!attachmentsJson) return [];
  try {
    const parsed = JSON.parse(attachmentsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is ChatAttachment =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as ChatAttachment).documentId === 'string' &&
        typeof (a as ChatAttachment).fileName === 'string',
    );
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload (camera / gallery) — reuses the Document Vault GCS pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** A local file selected from the camera or gallery, before upload. */
export interface LocalPickedFile {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  source: Extract<ChatAttachmentSource, 'capture' | 'gallery'>;
}

interface UploadDocumentResponse {
  documentId?: string;
  /** Some callers historically returned `id`; tolerate both. */
  id?: string;
  storagePath?: string;
  status?: string;
}

/**
 * Upload a single local file via POST /documents/upload (multipart) and map the
 * response to a {@link ChatAttachment}. The file lands in the Document Vault and
 * is therefore reusable, org-scoped and retained.
 *
 * @throws the underlying axios error on failure (caller shows a toast/retry).
 */
export async function uploadChatAttachment(
  file: LocalPickedFile,
  onProgress?: (pct: number) => void,
): Promise<ChatAttachment> {
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    type: file.mimeType,
    name: file.fileName,
  } as unknown as Blob);

  const res = await apiClient.post<UploadDocumentResponse>(
    '/documents/upload',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (!onProgress) return;
        const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
        onProgress(pct);
      },
    },
  );

  const documentId = res.data.documentId ?? res.data.id ?? '';
  return {
    documentId,
    storagePath: res.data.storagePath ?? '',
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    source: file.source,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Vault picker — reference existing documents (no re-upload)
// ─────────────────────────────────────────────────────────────────────────────

/** A row in the "share from Document Vault" picker. */
export interface VaultDocument {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath: string;
  category?: string;
  uploadedAt?: string;
}

/** Raw shape from GET /documents (field names vary — see DocumentListScreen AND-04). */
interface RawVaultDoc {
  id?: string;
  documentId?: string;
  fileName?: string;
  filename?: string;
  originalFileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  sizeBytes?: number;
  storagePath?: string;
  category?: string;
  categoryName?: string;
  uploadedAt?: string;
  documentDate?: string;
}

/**
 * List the caller's vault documents for the "share from Document Vault" picker.
 * Tolerates both a bare array and a `{ items }` envelope (DocumentService returns
 * either depending on the route — see DocumentListScreen).
 */
export async function listVaultDocuments(params?: {
  category?: string;
  q?: string;
}): Promise<VaultDocument[]> {
  const search = new URLSearchParams();
  if (params?.category && params.category !== 'All') {
    search.set('category', params.category);
  }
  if (params?.q) search.set('q', params.q);
  const qs = search.toString();

  const res = await apiClient.get<RawVaultDoc[] | { items?: RawVaultDoc[] }>(
    `/documents${qs ? `?${qs}` : ''}`,
  );
  const data = res.data as unknown;
  const rows: RawVaultDoc[] = Array.isArray(data)
    ? (data as RawVaultDoc[])
    : ((data as { items?: RawVaultDoc[] })?.items ?? []);

  return rows
    .map((r): VaultDocument | null => {
      const documentId = r.documentId ?? r.id;
      if (!documentId) return null;
      return {
        documentId,
        fileName:
          r.fileName ?? r.filename ?? r.originalFileName ?? 'document',
        mimeType: r.mimeType ?? 'application/octet-stream',
        sizeBytes: r.fileSizeBytes ?? r.sizeBytes,
        storagePath: r.storagePath ?? '',
        category: r.category ?? r.categoryName,
        uploadedAt: r.uploadedAt ?? r.documentDate,
      };
    })
    .filter((d): d is VaultDocument => d !== null);
}

/** Map a chosen vault document into a {@link ChatAttachment}. */
export function vaultDocumentToAttachment(doc: VaultDocument): ChatAttachment {
  return {
    documentId: doc.documentId,
    storagePath: doc.storagePath,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    source: 'vault',
  };
}
