import { useState, type ReactNode } from 'react'
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
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { cn } from '@/lib/utils'
import { PaymentGatewaySettings } from './sections/PaymentGatewaySettings'
import { WhatsAppSettings } from './sections/WhatsAppSettings'
import { AiModelSettings } from './sections/AiModelSettings'
import { LanguageSettings } from './sections/LanguageSettings'
import { PartnerBanksSettings } from './sections/PartnerBanksSettings'
import { TallySettings } from './sections/TallySettings'
import { FeatureFlagsSettings } from './sections/FeatureFlagsSettings'
import { NotificationSettings } from './sections/NotificationSettings'
import { UserPreferencesSettings } from './sections/UserPreferencesSettings'
import { DevicesSettings } from './sections/DevicesSettings'
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
  { id: 'two-fa', label: 'Two-Factor Authentication', icon: ShieldCheck, group: 'Account' },
]

const sectionComponents: Record<SettingSection, ReactNode> = {
  'payment-gateway': <PaymentGatewaySettings />,
  'whatsapp': <WhatsAppSettings />,
  'ai-model': <AiModelSettings />,
  'language': <LanguageSettings />,
  'partner-banks': <PartnerBanksSettings />,
  'tally': <TallySettings />,
  'preferences': <UserPreferencesSettings />,
  'devices': <DevicesSettings />,
  'two-fa': <TwoFaSettings />,
  'subscriptions': (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-neutral-900">Subscription Plans</h2>
      <p className="text-neutral-500">Manage subscription tiers, pricing, and feature limits</p>
      <Button variant="primary">Go to Plan Configuration</Button>
      <div className="grid grid-cols-3 gap-4 mt-4">
        {[
          { label: 'Total Plans', value: '4' },
          { label: 'Active Subscribers', value: '1,247' },
          { label: 'MRR', value: '₹8.4L' },
        ].map((stat) => (
          <Card key={stat.label} className="text-center">
            <p className="text-2xl font-bold text-neutral-900 tabular-nums">{stat.value}</p>
            <p className="text-sm text-neutral-500 mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>
    </div>
  ),
  'feature-flags': <FeatureFlagsSettings />,
  'notifications': <NotificationSettings />,
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
          {sectionComponents[activeSection] ?? (
            <div className="text-center py-12 text-neutral-400">
              <p>Select a settings section</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
