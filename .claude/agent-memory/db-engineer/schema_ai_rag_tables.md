---
name: schema-ai-rag-tables
description: ai.chunks / ai.embeddings / ai.interactions (migration 075) — RAG store, FLOAT4[] vector (pgvector deferred to P7b), append-only interaction audit
metadata:
  type: project
---

Migration 075 (P7a, 2026-06-11) created the AiService RAG store + AI usage audit, reconstructed column-for-column from EF configs (`AiChunkConfiguration`/`AiEmbeddingConfiguration`/`AiInteractionConfiguration`), same method as 074.

- `ai.chunks` — RAG chunks; UNIQUE `uix_ai_chunks_document_index (document_id, chunk_index)`; org + document indexes; `page_number` nullable; `created_by`/`updated_by` are TEXT (EF sets no HasMaxLength on these `string?` props — so TEXT not VARCHAR).
- `ai.embeddings` — 1:1 with chunks via `chunk_id REFERENCES ai.chunks(id) ON DELETE CASCADE`; **`float_vector FLOAT4[]` NOT NULL**; NO audit columns (EF maps none).
- `ai.interactions` — APPEND-ONLY AI usage audit; immutable via 071 [[schema-accounting-edit-log]] pattern (`ai.reject_interaction_mutation()` rejects UPDATE/DELETE/TRUNCATE + REVOKE). `organization_id` NULLABLE (`AiInteraction.OrganizationId` is `Guid?`); index `ix_ai_interactions_org_feature_date (organization_id, feature_code, created_at)`.

**pgvector decision:** pgvector IS enabled (extension `vector` 0.8.2, HNSW used elsewhere) but P7a deliberately stores embeddings as `FLOAT4[]` for EF compatibility (Pgvector.EntityFrameworkCore is a P7b concern). 075 carries a commented **P7b upgrade DDL block**: ADD `embedding vector(768)`, backfill `float_vector::vector`, HNSW `vector_cosine_ops` index, then deprecate float_vector. Dim 768 = the P7a embedding model. When a handoff says "keep FLOAT4[] even though pgvector is ready", document the upgrade path in-migration rather than upgrading early.

**RLS house style** (org-membership subquery on `app.current_user_id`, NOT the handoff's nonexistent `app.current_org_id`) — same lesson as [[schema-gst-ims-gstr1a]].

**EF nullability parity lesson:** when an entity property is non-`.IsRequired()` in the EF config OR the C# type is `Guid?`/`int?`/`string?`, the DB column must be NULLABLE to match. Always check the domain entity property type, not just the config's `.IsRequired()` calls (e.g. AiInteraction.OrganizationId is Guid? and the config omits IsRequired → nullable column).
