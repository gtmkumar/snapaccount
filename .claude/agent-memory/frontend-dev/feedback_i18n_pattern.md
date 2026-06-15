---
name: i18n pattern — use @/i18n not react-i18next
description: This codebase uses a custom @/i18n t() function, NOT react-i18next useTranslation. New pages must use the custom module or tests will fail because the react-i18next provider is never initialized in tests.
type: feedback
---

Always import `{ t } from '@/i18n'` for all user-visible strings in page components. NEVER use `import { useTranslation } from 'react-i18next'` for admin panel pages.

**Why:** The project uses a lightweight custom i18n module (`src/i18n/index.ts`) instead of the standard react-i18next. No `I18nextProvider` is set up in test environments, so `useTranslation()` returns the key string verbatim (e.g., `"docQueue.title"`) instead of the translated value. Tests that check for English text like `"Document Queue"` will all fail with react-i18next.

**How to apply:**
- Page components: `import { t } from '@/i18n'` — call `t('key', { param: value })` directly (no hook needed)
- Sub-components inside pages: same — use the imported `t` directly, do NOT destructure from a hook
- The custom `t()` supports `{{param}}` interpolation via a second-arg object: `t('key', { count: n })`
- i18n keys are flat strings in `src/i18n/en.json` (not nested objects)
- The module does NOT handle pluralization (`_one` / `_other` variants must be referenced explicitly by the caller)
- Status enums stored as UPPER_CASE (e.g., `OPEN`, `RESOLVED`) but i18n keys use lowercase (e.g., `itcMismatch.status.open`). Always lowercase: `t(\`itcMismatch.status.\${status.toLowerCase()}\`)`
