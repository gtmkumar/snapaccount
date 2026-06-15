---
name: stale-bundle-false-positives
description: Stale dev-server bundle causes false positive bugs — always hard-reload (or verify via source code) before filing a bug against frontend behavior
type: feedback
---

In Wave 5 live testing, BUG-MCA-ETYPE-005 was filed as HIGH severity claiming the frontend sent PascalCase entityType values to the backend when the backend required snake_case. After hard-reload verification, the source showed `EditLogPage.tsx` always used snake_case values in `ENTITY_TYPE_OPTIONS`. The bug was a stale Vite HMR bundle serving old JS.

**Why:** The admin dev server (:3000 / :5173) uses Vite HMR. If the server has been running through major source changes without a full page reload, the browser can serve a stale bundle that doesn't match current source. The original file may have used PascalCase during development and was later fixed; the stale bundle showed the old behaviour.

**How to apply:**
1. Before filing a frontend behavioural bug, always verify via source code inspection (`grep` the relevant tsx/ts file) in addition to browser observation.
2. The task instructions for this re-verification explicitly noted "hard-reload before judging anything" — follow this discipline for all live browser tests.
3. For curl-based API tests this doesn't apply — those bypass the frontend entirely.
4. If a backend 400 is observed for a filter, first check the source sends the correct value; only then file against frontend.

Related: [[project_wave5_state]]
