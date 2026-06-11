---
name: task-11-12-completion
description: Task #11 (subscription stats wired) and Task #12 (react-i18next removal, i18n parity CI gate) completion details
metadata:
  type: project
---

## Task #11: Settings Subscription Tiers — real API wiring

- `SettingsPage.tsx` fabricated stats ("4 plans", "1,247 subscribers", "₹8.4L MRR") removed
- New `SubscriptionTiersSettings` component added — fetches real data via `useQuery(listPlans)` and `useQuery(getMrrDashboard)` from existing `subscriptionApi.ts`
- Proper loading skeleton and empty state ("No plans configured yet" + CTA) added
- `sectionComponents` static `Record<SettingSection, ReactNode>` converted to `SECTION_COMPONENT_MAP: Record<SettingSection, () => ReactNode>` factory-function pattern — required because `useQuery`/`useNavigate` hooks inside the settings component can only be called during React render, not at module-level

**Fabricated-stats sweep findings (other Settings sections):** No other sections contained fabricated numbers. `SubscribersPage` and `InvoicesPage` do not exist as separate pages — not in scope to build.

## Task #12: react-i18next removal and i18n parity CI gate

**13 files migrated from react-i18next to @/i18n:**
1. `components/ui/CommandPalette.tsx`
2. `components/ui/ThemeToggle.tsx`
3. `components/ui/KeyboardShortcutsOverlay.tsx`
4. `components/layout/TopBar.tsx`
5. `components/shared/RoleGuard.tsx`
6. `pages/settings/NavigationManagementPage.tsx`
7. `pages/chat/ChatInboxPage.tsx`
8. `pages/chat/ChatThreadDetailPage.tsx`
9. `pages/subscriptions/SubscriptionsPage.tsx`
10. `pages/team/WorkloadTab.tsx`
11. `pages/team/KpiTab.tsx`
12. `pages/team/TeamPage.tsx`
13. `pages/team/StaffTab.tsx`
14. `pages/reports/ReportsPage.tsx` (14 total — original count was 13+1)

**react-i18next and i18next removed from package.json** (not in node_modules any more).

**CI key-parity test** added at `src/__tests__/i18nKeyParity.test.ts` — fails if en/hi/bn key sets diverge.

**Parity fix:** hi.json was missing 60 pre-existing keys; bn.json was missing 341 pre-existing keys (entire sections: invite, orgs, permissions, refdata, roles, users.addUser, users.attrs, users.editUser, users.deleteUser). All added with proper Hindi and Bengali translations. Also added `common.actions`, `common.loading`, and `team.workload.load.*` keys discovered during test-fix pass.

**Final counts:** en/hi/bn each have 1611 keys, zero divergence.

**Test fixes required:**
- `TeamStaffTabs.test.tsx`: `getByText(/overloaded/i)` → `getAllByText(/overloaded/i).length >= 1` because legend label + capacity banner both match
- `ChatThreadDetailPage.test.tsx`: `common.actions` key was missing from catalog → button aria-label rendered as raw key; fixed by adding key to all three files
- `WorkloadTab.tsx`: TypeScript error — `t()` was being called with string as second arg (range labels as fallback strings). Fixed by adding `team.workload.load.*` keys to catalog and removing the string arg

**Gates at completion:** 928/928 tests pass, 0 lint errors, build succeeds.

**Why:** [[i18n pattern — @/i18n not react-i18next]] — react-i18next was uninitialised in the test env (and in production), causing raw-key rendering for ~14 components.
