/**
 * TeamPage — SnapAccount internal-staff management.
 *
 * Plan alignment (SnapAccount_Complete_Project_Plan.md §"User Types & Roles" + §J6):
 * the product model is single-tenant — "Team" means SnapAccount's own Admin-Panel
 * staff (Data Entry Operator, Support Executive, CA, Operations Manager; + Super
 * Admin / Partner Bank Rep). Customers (Business Owner / Employee, mobile app) live
 * on the Users page, never here.
 *
 * Tabs: Staff (roster, Screen 87) · Workload (89) · KPIs (90) · Roles (J6 matrix).
 * The earlier org-scoped Members/Invites tabs (a multi-tenant RBAC add-on the plan
 * does not require) were removed; reintroduce them only when a "business owner
 * manages their own staff" feature is actually scoped. Staff invitation is retained
 * (Ops Manager "manages the team") via the Invite Teammate dialog.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UserPlus, Shield, Users2, LayoutGrid, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Tabs, TabList, TabTrigger, TabPanels, TabPanel } from '@/components/ui/Tabs'
import { Dialog } from '@/components/ui/Dialog'
import { RoleChip } from '@/components/ui/RoleChip'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { inviteTeamMember, type InviteTeamMemberParams } from '@/lib/teamApi'
import type { AdminRole } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { StaffTab } from './StaffTab'
import { WorkloadTab } from './WorkloadTab'
import { KpiTab } from './KpiTab'

const ROLE_OPTIONS: AdminRole[] = ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP']
const MODULE_OPTIONS = ['GST', 'ITR', 'Loans', 'Reports', 'Documents']

export default function TeamPage() {
  const { t } = useTranslation()
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('team.title', 'Team')}
          subtitle={t('team.subtitle', 'Manage SnapAccount staff, roles, and workload distribution.')}
        />
        <Button variant="primary" onClick={() => setShowInvite(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          {t('team.invite', 'Invite Teammate')}
        </Button>
      </div>

      <Tabs defaultTab="staff">
        <TabList>
          <TabTrigger id="staff">
            <Users2 className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.staff', 'Staff')}
          </TabTrigger>
          <TabTrigger id="workload">
            <LayoutGrid className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.workload', 'Workload')}
          </TabTrigger>
          <TabTrigger id="kpis">
            <BarChart3 className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.kpis', 'KPIs')}
          </TabTrigger>
          <TabTrigger id="roles">
            <Shield className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.roles', 'Roles')}
          </TabTrigger>
        </TabList>

        <TabPanels className="mt-6">
          {/* Staff tab — design Screen 87 */}
          <TabPanel id="staff">
            <StaffTab onInvite={() => setShowInvite(true)} />
          </TabPanel>

          {/* Workload tab — design Screen 89 */}
          <TabPanel id="workload">
            <WorkloadTab />
          </TabPanel>

          {/* KPI tab — design Screen 90 */}
          <TabPanel id="kpis">
            <KpiTab />
          </TabPanel>

          {/* Roles tab — plan §J6 access matrix (staff roles) */}
          <TabPanel id="roles">
            <ErrorBoundary scope="pane">
              <div className="space-y-4">
                {ROLE_OPTIONS.map(role => (
                  <div key={role} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                    <div className="flex items-center gap-3 mb-2">
                      <Shield className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                      <RoleChip role={role} size="md" />
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                  </div>
                ))}
              </div>
            </ErrorBoundary>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Invite dialog — invites a SnapAccount staff member */}
      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSent={() => setShowInvite(false)}
      />
    </div>
  )
}

// ── Role descriptions (plan §J6) ───────────────────────────────────────────────
const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Full access to all modules, settings, team management, and subscriptions.',
  OPERATIONS_MANAGER: 'Manages the team, monitors KPIs, views reports, and handles escalations.',
  CA: 'Chartered Accountant — reviews statements, creates tax computations, handles IT/GST notices, and answers expert chat.',
  SUPPORT_EXECUTIVE: 'Calls users for missing/wrong documents, verifies ITR docs, and files GST/ITR after CA approval.',
  DATA_ENTRY_OPERATOR: 'Verifies OCR data and processes documents — the first line of processing.',
  PARTNER_BANK_REP: 'Partner bank access — view loan applications and bank communications.',
}

// ── Invite dialog ─────────────────────────────────────────────────────────────
interface InviteDialogProps {
  open: boolean
  onClose: () => void
  onSent: () => void
}

function InviteDialog({ open, onClose, onSent }: InviteDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRole>('CA')
  const [modules, setModules] = useState<string[]>([])

  const inviteMutation = useMutation({
    mutationFn: () => inviteTeamMember({ name, email, role, modules } satisfies InviteTeamMemberParams),
    onSuccess: () => {
      toast.success(t('team.inviteSent', 'Invitation sent!'))
      onSent()
    },
    onError: () => toast.error(t('team.inviteError', 'Failed to send invitation')),
  })

  const toggleModule = (mod: string) => {
    setModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('team.inviteTitle', 'Invite Teammate')}
      description={t('team.inviteDesc', 'Send an invitation with a 72-hour magic link.')}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => inviteMutation.mutate()}
            loading={inviteMutation.isPending}
            disabled={!name || !email}
          >
            {t('team.sendInvite', 'Send invitation')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('team.name', 'Name')} *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Riya Sharma"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('team.email', 'Email')} *
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="riya@firm.com"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            {t('team.role', 'Role')} *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.slice(1).map(r => (
              <label
                key={r}
                className={cn(
                  'flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                  role === r
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="mt-0.5"
                />
                <div>
                  <RoleChip role={r} size="sm" />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">{ROLE_DESCRIPTIONS[r].slice(0, 60)}…</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {(role === 'CA' || role === 'SUPPORT_EXECUTIVE') && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              {t('team.modules', 'Module Access')}
            </label>
            <div className="flex flex-wrap gap-2">
              {MODULE_OPTIONS.map(mod => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => toggleModule(mod)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    modules.includes(mod)
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                  )}
                >
                  {mod}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
