# Document Scanner + Multi-Provider AI Extraction — Design Spec

> Status: DRAFT for approval · Date: 2026-06-02 · Owner: this session
> Drives the work requested: "enable & integrate the document scanner, integrate the
> upload API, extract document details, and save them in the DB" — with **multi-provider
> AI configuration** (Tesseract default + Gemini + OpenAI + Anthropic + Google Document AI)
> and **organization-scoped feature/provider configuration** governed by RBAC.

---

## 1. Goals

1. **Working scanner → upload → extract → persist** end-to-end, on **iOS + Android**, from
   **camera capture AND gallery/file upload**.
2. **Pluggable extraction providers**, selectable per organization:
   - `tesseract` — local, free, offline. **Default.**
   - `gemini` — Google AI Studio Gemini vision (free tier, needs API key).
   - `openai` — GPT vision (needs key).
   - `anthropic` — Claude vision (needs key).
   - `document_ai` — Google Document AI (paid GCP).
   Each provider exposes **tiers**: `fast` / `efficient` / `advanced` mapped to concrete models.
3. **Two-tier configuration with RBAC:**
   - **Super Admin (platform)** — defines which providers/models are *available*, sets the
     **org-level** provider/model/tier, and can enable/disable features *at the org level*.
     **Org-level configuration is editable ONLY by Super Admin.**
   - **Org Admin (organization)** — can **enable/disable features for users within their own org**
     (e.g., turn auto-extract on/off), but cannot change the org's provider/model.
4. Extracted fields persisted and surfaced to mobile: **vendor, amount, document date, GSTIN,
   invoice number, tax/GST rate**, plus per-field confidence.

---

## 2. Current state (verified)

- **Upload** works: `POST /documents/upload` (multipart) → `{ documentId, storagePath, status }`.
- **OCR** is a **stub**: `DevOcrJobEnqueuer` marks docs PROCESSED with placeholder fields. Real
  path is `GoogleDocumentAiService` (paid GCP). `IOcrService.ExtractAsync` returns
  `OcrExtractedData { ConfidenceScore, Fields:Dictionary<string,string>, RawResponse, ProcessingTimeMs }`.
- **DB model already supports per-field extraction**: `document.documents` (vendor_name, amount,
  document_date, status), `document.ocr_results` (provider, confidence, raw), `document.ocr_fields`
  (field_name, value, confidence, bbox, page). `Document.StartOcr/CompleteOcr/MarkProcessed` exist.
- **Admin AI config screen exists** (`AiModelSettings.tsx`) and **Feature Flags screen exists**,
  but their backend endpoints (`/auth/config/ai`, `/auth/feature-flags`) **do not exist** — nothing
  is persisted today.
- **Mobile**: camera capture + upload queue + status machine exist; but the **gallery button is a
  no-op**, there is **no polling** for completion (cards hang in PROCESSING → TIMEOUT), and the list
  doesn't auto-refresh after upload. Routing per-service is wired (`/documents` → :5102).
- **RBAC**: `SUPER_ADMIN` (`platform.*` / wildcard) vs org roles (`org.*`). Org config perms exist:
  `org.settings.read/update`. Permission enforced by `[RequiresPermission]` + `PermissionBehavior`.

---

## 3. Architecture

### 3.1 Configuration model (new)

Owned by **AuthService** (`auth` schema), since it already owns org/role/settings and issues the
JWT. Two new tables:

**`auth.ai_provider_catalog`** (platform-managed reference data; Super Admin only)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| provider | text | `tesseract`/`gemini`/`openai`/`anthropic`/`document_ai` |
| tier | text | `fast`/`efficient`/`advanced` |
| model_id | text | concrete model, e.g. `gemini-2.0-flash`, `gpt-4o-mini`, `claude-haiku-4-5` |
| capabilities | text[] | e.g. `{ocr, classify, chat}` |
| requires_key | bool | tesseract/document_ai = false (key via GCP); others = true |
| is_enabled | bool | platform availability switch |

**`auth.organization_ai_config`** (one row per org; `organization_id NULL` = platform default)
| column | type | notes |
|---|---|---|
| organization_id | uuid? | NULL = platform default fallback |
| ocr_provider | text | resolved default `tesseract` |
| ocr_tier | text | `efficient` |
| auto_extract_enabled | bool | feature: run OCR automatically on upload |
| auto_classify_enabled | bool | feature: AI category suggestion |
| confidence_threshold | numeric(3,2) | 0.00–1.00 |
| enabled_features | jsonb | per-feature on/off map (org-admin editable subset) |
| updated_by / updated_at | | audit |

**Effective config resolution**: org row → fall back to platform-default row → hard-coded defaults
(`tesseract`/`efficient`/auto-extract on). Provider **API keys** are NOT stored per-org in plaintext;
keys live in server config / Secret Manager keyed by provider (`Ai:Gemini:ApiKey`, `Ai:OpenAI:ApiKey`,
`Ai:Anthropic:ApiKey`). Org config only selects *which* provider/tier.

### 3.2 Endpoints (AuthService)

- `GET  /auth/config/ai` — effective config for caller's org (Org Admin + Super Admin read).
- `GET  /auth/config/ai/catalog` — provider/model/tier catalog (Super Admin).
- `PATCH /auth/config/ai` — **feature toggles** for caller's org (Org Admin; `org.settings.update`).
- `GET  /auth/admin/orgs/{orgId}/config/ai` — Super Admin: read any org's config.
- `PUT  /auth/admin/orgs/{orgId}/config/ai` — **Super Admin only**: set org provider/model/tier +
  org-level enablement (`platform.orgs.* ` / new `platform.ai.manage`).
- Effective config is also **embedded into the JWT** (claims: `ai_ocr_provider`, `ai_ocr_tier`,
  `ai_auto_extract`) so DocumentService resolves without a cross-service call. (Fallback: a small
  internal `GET /auth/config/ai/effective?organizationId=` for the OCR worker.)

New permission: **`platform.ai.manage`** (Super Admin) + reuse `org.settings.update` (Org Admin).

### 3.3 OCR provider abstraction (DocumentService)

- Keep `IOcrService.ExtractAsync(storagePath, mimeType, ct) → OcrExtractedData`.
- New implementations: `TesseractOcrService` (shells `tesseract` CLI / Tesseract.NET on the
  local file from `LocalFileStorageService`, then heuristic field parse), `GeminiOcrService`,
  `OpenAiOcrService`, `AnthropicOcrService`. Keep `GoogleDocumentAiService`.
- New `IOcrServiceResolver` picks the impl from the **effective org config** (provider+tier).
- `DevOcrJobEnqueuer` → renamed/replaced by `InlineOcrJobEnqueuer`: resolves the provider, calls
  `ExtractAsync`, maps `Fields` → `Document` (vendor/amount/date) + `OcrResult` + `OcrField` rows
  with confidence, then `CompleteOcr` + `MarkProcessed`. Runs inline locally; the Pub/Sub worker
  uses the same resolver in prod.
- **Heuristic parser** (for Tesseract raw text → fields): regex for ₹/Rs amounts (pick max/total),
  dates (dd/mm/yyyy etc.), GSTIN (15-char pattern), invoice no, vendor (first non-empty line).

### 3.4 Extraction field set

`vendor_name, amount, document_date, gstin, invoice_number, tax_amount, gst_rate, total_amount`.
Persist summary fields on `Document`; full set + confidence in `ocr_fields`. Extend `GetDocument`
DTO to return the field list + `confidenceLevel` (GREEN/YELLOW/RED) for the Document Detail screen.

### 3.5 Mobile

- **Gallery/file upload**: wire the dead gallery button with `expo-image-picker`
  (`launchImageLibraryAsync`) + a "+" sheet (Camera / Gallery / Files). Enqueue same as camera.
- **Polling**: after upload, poll `GET /documents/{id}` until `PROCESSED`/`OCR_COMPLETE`/`REJECTED`
  (or SignalR later) → call `markReady`, invalidate the list query so the server card replaces the
  optimistic one. Removes the PROCESSING→TIMEOUT hang.
- **Document Detail**: render extracted fields + confidence banner (already designed in
  `document-vault.md` Screen 15).
- Works on **iOS + Android** (gallery is the only way to test real OCR on a simulator — the camera
  yields blank frames).

---

## 4. RBAC summary

| Action | Super Admin | Org Admin | Notes |
|---|---|---|---|
| View effective AI config | ✓ | ✓ | `/auth/config/ai` |
| Toggle features for org's users | ✓ | ✓ | `org.settings.update` |
| Set org provider/model/tier | ✓ | ✗ | `platform.ai.manage` — **Super Admin only** |
| Manage provider catalog / availability | ✓ | ✗ | platform reference data |

---

## 5. Phased delivery

**Phase 1 — Real extraction + scanner completion (default Tesseract), no config UI yet.**
- DocumentService: `TesseractOcrService` + heuristic parser + `IOcrServiceResolver` (hard-defaults
  to tesseract) + `InlineOcrJobEnqueuer` mapping fields→DB (Document + ocr_fields).
- Extend `GetDocument` DTO with extracted fields + confidence.
- Mobile: gallery/file picker + add sheet, polling→markReady→list refresh, Document Detail fields.
- Verify on iOS + Android with a real bill image (gallery).

**Phase 2 — Config backend + org scoping.**
- `organization_ai_config` + `ai_provider_catalog` tables + migrations.
- AuthService endpoints (effective/get/patch/admin put) + `platform.ai.manage` permission + JWT
  claims. Resolver reads effective config.

**Phase 3 — Cloud providers.**
- `GeminiOcrService`, `OpenAiOcrService`, `AnthropicOcrService` behind the resolver + tier→model map.
  Keys from server config/Secret Manager. Document AI already present.

**Phase 4 — Admin UI.**
- Extend `AiModelSettings.tsx`: provider+tier matrix, OCR provider selector, per-org config view for
  Super Admin (org picker), feature toggles for Org Admin. Wire the now-real endpoints. Update
  Feature Flags backend.

---

## 6. Local-dev / cost posture

- Default `tesseract` keeps everything **free + offline**. Cloud providers stay **off** unless a key
  is configured and Super Admin selects them. Document AI requires paid GCP and stays off locally.
- Tesseract is already installed at `/opt/homebrew/bin/tesseract`.
