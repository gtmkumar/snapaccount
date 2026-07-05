import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CreditCard,
  MessageCircle,
  Brain,
  Globe,
  Building2,
  BookOpen,
  Flag,
  Bell,
  Zap,
  User,
  Monitor,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { cn } from '@/lib/utils'
import { formatIndianAmount } from '@/lib/utils'
import { getMrrDashboard, listPlans } from '@/lib/subscriptionApi'
import { t } from '@/i18n'
import { useNavigate } from 'react-router'
import { PaymentGatewaySettings } from './sections/PaymentGatewaySettings'
import { WhatsAppSettings } from './sections/WhatsAppSettings'
import { AiModelSettings } from './sections/AiModelSettings'
import { LanguageSettings } from './sections/LanguageSettings'
import { TallySettings } from './sections/TallySettings'
import { FeatureFlagsSettings } from './sections/FeatureFlagsSettings'
import { NotificationSettings } from './sections/NotificationSettings'
import { UserPreferencesSettings } from './sections/UserPreferencesSettings'
import { DevicesSettings } from './sections/DevicesSettings'
import { DeviceApprovalQueue } from './sections/DeviceApprovalQueue'
import { TwoFaSettings } from './sections/TwoFaSettings'

type SettingSection =
  | 'payment-gateway'
  | 'whatsapp'
  | 'ai-model'
  | 'language'
  | 'partner-banks'
  | 'tally'
  | 'subscriptions'
  | 'feature-flags'
  | 'notifications'
  | 'preferences'
  | 'devices'
  | 'device-approvals'
  | 'two-fa'

interface NavItem {
  id: SettingSection
  label: string
  icon: React.FC<{ className?: string }>
  group: string
}

const navItems: NavItem[] = [
  { id: 'payment-gateway', label: 'Payment Gateway', icon: CreditCard, group: 'Integrations' },
  { id: 'whatsapp', label: 'WhatsApp Business API', icon: MessageCircle, group: 'Integrations' },
  { id: 'ai-model', label: 'AI Model Configuration', icon: Brain, group: 'Integrations' },
  { id: 'partner-banks', label: 'Partner Banks', icon: Building2, group: 'Integrations' },
  { id: 'tally', label: 'Tally Integration', icon: BookOpen, group: 'Integrations' },
  { id: 'notifications', label: 'Notification Channels', icon: Bell, group: 'Integrations' },
  { id: 'language', label: 'Language Settings', icon: Globe, group: 'Platform' },
  { id: 'subscriptions', label: 'Subscription Tiers', icon: Zap, group: 'Platform' },
  { id: 'feature-flags', label: 'Feature Flags', icon: Flag, group: 'Platform' },
  { id: 'preferences', label: 'My Preferences', icon: User, group: 'Account' },
  { id: 'devices', label: 'Logged-in Devices', icon: Monitor, group: 'Account' },
  { id: 'device-approvals', label: 'Device Approval Queue', icon: ShieldAlert, group: 'Account' },
  { id: 'two-fa', label: 'Two-Factor Authentication', icon: ShieldCheck, group: 'Account' },
]

const SECTION_COMPONENT_MAP: Record<SettingSection, () => ReactNode> = {
  'payment-gateway': () => <PaymentGatewaySettings />,
  'whatsapp': () => <WhatsAppSettings />,
  'ai-model': () => <AiModelSettings />,
  'language': () => <LanguageSettings />,
  'partner-banks': () => <PartnerBanksRedirect />,
  'tally': () => <TallySettings />,
  'preferences': () => <UserPreferencesSettings />,
  'devices': () => <DevicesSettings />,
  'device-approvals': () => <DeviceApprovalQueue />,
  'two-fa': () => <TwoFaSettings />,
  'subscriptions': () => <SubscriptionTiersSettings />,
  'feature-flags': () => <FeatureFlagsSettings />,
  'notifications': () => <NotificationSettings />,
}

// ── Partner Banks (redirect to the dedicated CRUD page) ─────────────────────
// The full partner-bank manager is a routed page (/settings/partner-banks). The
// old inline section here was a divergent UI-only placeholder (non-spec adapter
// types, dead Save) — collapsed into a redirect so there is one source of truth (CG-7).
function PartnerBanksRedirect() {
  const navigate = useNavigate()
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('admin.partnerBanks.title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('admin.partnerBanks.help')}
          </p>
        </div>
        <Button variant="primary" onClick={() => void navigate('/loans/partner-banks')}>
          <ExternalLink className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {t('settings.partnerBanks.cta')}
        </Button>
      </div>
    </div>
  )
}

// ── Subscription Tiers Settings (wired to real backend) ─────────────────────
function SubscriptionTiersSettings() {
  const navigate = useNavigate()

  const { data: mrr, isLoading: mrrLoading } = useQuery({
    queryKey: ['subscriptions', 'mrr'],
    queryFn: getMrrDashboard,
    staleTime: 60_000,
  })

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscriptions', 'plans'],
    queryFn: listPlans,
    staleTime: 60_000,
  })

  const isLoading = mrrLoading || plansLoading
  const activePlans = plans?.filter(p => p.isActive) ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('settings.subscriptions.title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('settings.subscriptions.subtitle')}
          </p>
        </div>
        <Button variant="primary" onClick={() => void navigate('/subscriptions')}>
          <ExternalLink className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {t('settings.subscriptions.cta')}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} variant="card" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center py-4">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {activePlans.length}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {t('settings.subscriptions.totalPlans')}
            </p>
          </Card>
          <Card className="text-center py-4">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {mrr?.activeSubscriptions ?? 0}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {t('settings.subscriptions.activeSubscribers')}
            </p>
          </Card>
          <Card className="text-center py-4">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              ₹{formatIndianAmount(mrr?.totalMrr ?? 0)}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {t('settings.subscriptions.mrr')}
            </p>
          </Card>
        </div>
      )}

      {!isLoading && activePlans.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t('subscriptions.noPlans')}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {t('subscriptions.noPlansDesc')}
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => void navigate('/subscriptions')}>
            {t('subscriptions.createFirst')}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingSection>('payment-gateway')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const groups = Array.from(new Set(navItems.map(item => item.group)))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Configure platform integrations, feature flags, and system behavior"
      />

      {hasUnsavedChanges && (
        <AlertBanner
          type="warning"
          title="Unsaved Changes"
          description="You have unsaved changes. Save or discard before navigating away."
          actions={
            <>
              <Button variant="primary" size="sm" onClick={() => setHasUnsavedChanges(false)}>Save Changes</Button>
              <Button variant="ghost" size="sm" onClick={() => setHasUnsavedChanges(false)}>Discard</Button>
            </>
          }
        />
      )}

      <div className="flex gap-6">
        {/* Left nav */}
        <nav
          className="w-60 shrink-0 bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden self-start sticky top-6"
          aria-label="Settings navigation"
        >
          {groups.map((group, groupIndex) => (
            <div key={group}>
              {groupIndex > 0 && <div className="border-t border-neutral-100" />}
              <div className="px-3 pt-3 pb-1">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-2 py-1">
                  {group}
                </p>
              </div>
              {navItems.filter(item => item.group === group).map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-4 py-2.5 text-sm rounded-lg mx-1 mb-0.5 transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </button>
                )
              })}
              {groupIndex === groups.length - 1 && <div className="pb-2" />}
            </div>
          ))}
        </nav>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {SECTION_COMPONENT_MAP[activeSection]?.() ?? (
            <div className="text-center py-12 text-neutral-400">
              <p>Select a settings section</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
