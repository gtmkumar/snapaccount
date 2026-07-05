import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/shared/AuthGuard'
import { ForbiddenPage } from '@/components/shared/RoleGuard'
import { RoutePermissionGuard } from '@/components/shared/RoutePermissionGuard'
import { CommandPaletteProvider } from '@/contexts/CommandPaletteContext'
import { KeyboardShortcutsProvider } from '@/contexts/KeyboardShortcutsContext'
import { WebMcpTools } from '@/hooks/useWebMcpTools'
import LoginPage from '@/pages/auth/LoginPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import DocumentQueuePage from '@/pages/documents/DocumentQueuePage'
import DocumentReviewPage from '@/pages/documents/DocumentReviewPage'
import GstFilingQueuePage from '@/pages/gst/GstFilingQueuePage'
import GstReturnReviewPage from '@/pages/gst/GstReturnReviewPage'
import ItcMismatchPage from '@/pages/gst/ItcMismatchPage'
// Phase 6B — GST Notice Tracker
import NoticeTrackerListPage from '@/pages/gst/NoticeTrackerListPage'
import NoticeDetailPage from '@/pages/gst/NoticeDetailPage'
// GAP-022 — GST Tax Rate Configuration (gst.admin.taxrates)
import GstTaxRatesPage from '@/pages/gst/GstTaxRatesPage'
// GAP-101 — GSTN IMS Inbox (Board #32, mandatory from 1 Apr 2026)
import ImsInboxPage from '@/pages/gst/ImsInboxPage'
import ImsInvoiceDetailPage from '@/pages/gst/ImsInvoiceDetailPage'
import Gstr1aPage from '@/pages/gst/Gstr1aPage'
import UserListPage from '@/pages/users/UserListPage'
import UserDetailPage from '@/pages/users/UserDetailPage'
import SettingsPage from '@/pages/settings/SettingsPage'
// Phase 6D — ITR (full rewrite)
import ItrPage from '@/pages/itr/ItrPage'
import ItrFilingDetailPage from '@/pages/itr/ItrFilingDetailPage'
import CaTaxComputationPanelPage from '@/pages/itr/CaTaxComputationPanelPage'
// Phase 6C — Loan Hub (full build, replaces stub)
import LoansListPage from '@/pages/loans/LoansListPage'
import LoanDetailPage from '@/pages/loans/LoanDetailPage'
import BankCommunicationsPage from '@/pages/loans/BankCommunicationsPage'
import PartnerBanksSettingsPage from '@/pages/loans/PartnerBanksSettingsPage'
// Phase 6F — Chat (full build)
import ChatPage from '@/pages/chat/ChatPage'
import ChatThreadDetailPage from '@/pages/chat/ChatThreadDetailPage'
// DG-CHAT-09 — Chat Analytics (Screen 83)
import ChatAnalyticsPage from '@/pages/chat/ChatAnalyticsPage'
import TeamPage from '@/pages/team/TeamPage'
import SubscriptionsPage from '@/pages/subscriptions/SubscriptionsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
// Phase 6E — Callbacks
import CallbackListPage from '@/pages/callbacks/CallbackListPage'
import CallbackDetailPage from '@/pages/callbacks/CallbackDetailPage'
import CallbackKpiPage from '@/pages/callbacks/CallbackKpiPage'
// DG-DASH-06 — Reports & Analytics suite (Screens 100-103)
import OperationalReportPage from '@/pages/reports/OperationalReportPage'
import PlatformRevenuePage from '@/pages/reports/PlatformRevenuePage'
import UserAnalyticsPage from '@/pages/reports/UserAnalyticsPage'
import ComplianceReportPage from '@/pages/reports/ComplianceReportPage'
// Module 1 — Auth/RBAC
import RolesPermissionsPage from '@/pages/roles/RolesPermissionsPage'
import PermissionCatalogPage from '@/pages/roles/PermissionCatalogPage'
import ReferenceDataPage from '@/pages/settings/ReferenceDataPage'
import NavigationManagementPage from '@/pages/settings/NavigationManagementPage'
import OrganizationsPage from '@/pages/orgs/OrganizationsPage'
import OrganizationDetailPage from '@/pages/orgs/OrganizationDetailPage'
import InviteAcceptancePage from '@/pages/auth/InviteAcceptancePage'
// Admin utilities — audit log (admin.dashboard.read)
import AuditLogPage from '@/pages/admin/AuditLogPage'
// GAP-038 / GAP-052 — System Health page (admin.dashboard.read)
import SystemHealthPage from '@/pages/admin/SystemHealthPage'
// MCA Compliance — edit log (accounting.editlog.read)
import EditLogPage from '@/pages/compliance/EditLogPage'
// GAP-036 — Subscriber list + Invoice management
import SubscriberListPage from '@/pages/subscriptions/SubscriberListPage'
import InvoiceManagementPage from '@/pages/subscriptions/InvoiceManagementPage'
// Wave 7 — GAP-037 Notification Templates
import TemplateListPage from '@/pages/notifications/TemplateListPage'
import TemplateEditorPage from '@/pages/notifications/TemplateEditorPage'
// CG-8 — full-page Notification Center (dropdown "View all", `g n`, palette all target this)
import NotificationsPage from '@/pages/notifications/NotificationsPage'
// Wave 7 — GAP-031 CA Appointments
import CaAvailabilityPage from '@/pages/ca/CaAvailabilityPage'
import CaAppointmentsPage from '@/pages/ca/CaAppointmentsPage'

// Layout wrapper for protected routes
// KeyboardShortcutsProvider uses useNavigate() so it must live inside the
// RouterProvider tree — mounting it here keeps it scoped to authenticated app shell.
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <KeyboardShortcutsProvider>
        <CommandPaletteProvider>
          <WebMcpTools />
          <AppShell>
            <RoutePermissionGuard>{children}</RoutePermissionGuard>
          </AppShell>
        </CommandPaletteProvider>
      </KeyboardShortcutsProvider>
    </AuthGuard>
  )
}

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <LoginPage />,
  },

  // Module 1 — Invite acceptance (PUBLIC, no auth required)
  {
    path: '/invite/:token',
    element: <InviteAcceptancePage />,
  },

  // Password reset flow (PUBLIC, no auth required)
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },

  // 403 Forbidden
  {
    path: '/403',
    element: <ForbiddenPage />,
  },

  // Redirect root to dashboard
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },

  // Protected routes
  {
    path: '/dashboard',
    element: (
      <ProtectedLayout>
        <DashboardPage />
      </ProtectedLayout>
    ),
  },

  // Documents
  {
    path: '/documents',
    element: (
      <ProtectedLayout>
        <DocumentQueuePage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/documents/:id',
    element: (
      <ProtectedLayout>
        <DocumentReviewPage />
      </ProtectedLayout>
    ),
  },

  // GST
  {
    path: '/gst',
    element: (
      <ProtectedLayout>
        <GstFilingQueuePage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/gst/itc-mismatch',
    element: (
      <ProtectedLayout>
        <ItcMismatchPage />
      </ProtectedLayout>
    ),
  },
  // Phase 6B: GST Notice Tracker (specific routes BEFORE dynamic :id)
  {
    path: '/gst/notices',
    element: (
      <ProtectedLayout>
        <NoticeTrackerListPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/gst/notices/:noticeId',
    element: (
      <ProtectedLayout>
        <NoticeDetailPage />
      </ProtectedLayout>
    ),
  },
  // GAP-101: IMS Inbox (specific routes BEFORE dynamic :id, GSTR-1A BEFORE detail)
  {
    path: '/gst/ims',
    element: (
      <ProtectedLayout>
        <ImsInboxPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/gst/ims/gstr1a',
    element: (
      <ProtectedLayout>
        <Gstr1aPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/gst/ims/:invoiceId',
    element: (
      <ProtectedLayout>
        <ImsInvoiceDetailPage />
      </ProtectedLayout>
    ),
  },
  // GAP-022: GST Tax Rate Config (specific route BEFORE dynamic :id)
  {
    path: '/gst/tax-rates',
    element: (
      <ProtectedLayout>
        <GstTaxRatesPage />
      </ProtectedLayout>
    ),
  },

  {
    path: '/gst/:id',
    element: (
      <ProtectedLayout>
        <GstReturnReviewPage />
      </ProtectedLayout>
    ),
  },

  // ITR — Phase 6D full rewrite
  {
    path: '/itr',
    element: (
      <ProtectedLayout>
        <ItrPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/itr/:filingId/computation',
    element: (
      <ProtectedLayout>
        <CaTaxComputationPanelPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/itr/:filingId',
    element: (
      <ProtectedLayout>
        <ItrFilingDetailPage />
      </ProtectedLayout>
    ),
  },

  // Loans — Phase 6C full build
  {
    path: '/loans',
    element: (
      <ProtectedLayout>
        <LoansListPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/loans/bank-communications',
    element: (
      <ProtectedLayout>
        <BankCommunicationsPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/loans/partner-banks',
    element: (
      <ProtectedLayout>
        <PartnerBanksSettingsPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/loans/:applicationId',
    element: (
      <ProtectedLayout>
        <LoanDetailPage />
      </ProtectedLayout>
    ),
  },

  // Chat — Phase 6F full build
  // DG-CHAT-09: /chat/analytics is a STATIC segment — must appear BEFORE /:threadId
  {
    path: '/chat',
    element: (
      <ProtectedLayout>
        <ChatPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/chat/analytics',
    element: (
      <ProtectedLayout>
        <ChatAnalyticsPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/chat/:threadId',
    element: (
      <ProtectedLayout>
        <ChatThreadDetailPage />
      </ProtectedLayout>
    ),
  },

  // Users
  {
    path: '/users',
    element: (
      <ProtectedLayout>
        <UserListPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/users/:id',
    element: (
      <ProtectedLayout>
        <UserDetailPage />
      </ProtectedLayout>
    ),
  },

  // Team — Phase 6F full build (ADMIN + OPERATIONS_MANAGER)
  {
    path: '/team',
    element: (
      <ProtectedLayout>
        <TeamPage />
      </ProtectedLayout>
    ),
  },
  {
    // Staff profile lives under the Team namespace so the sidebar stays on "Team"
    // (not "Users"). Reuses UserDetailPage, which renders a staff-adapted view.
    path: '/team/staff/:id',
    element: (
      <ProtectedLayout>
        <UserDetailPage />
      </ProtectedLayout>
    ),
  },

  // Subscriptions — Phase 6F full build (ADMIN only)
  {
    path: '/subscriptions',
    element: (
      <ProtectedLayout>
        <SubscriptionsPage />
      </ProtectedLayout>
    ),
  },
  // GAP-036 — Subscriber list (platform admin, subscription.plan.create)
  {
    path: '/subscriptions/subscribers',
    element: (
      <ProtectedLayout>
        <SubscriberListPage />
      </ProtectedLayout>
    ),
  },
  // GAP-036 — Invoice management (org-scoped + generate)
  {
    path: '/subscriptions/invoices',
    element: (
      <ProtectedLayout>
        <InvoiceManagementPage />
      </ProtectedLayout>
    ),
  },

  // Reports — Phase 6F full build
  {
    path: '/reports',
    element: (
      <ProtectedLayout>
        <ReportsPage />
      </ProtectedLayout>
    ),
  },

  // DG-DASH-06 — Reports & Analytics suite (Screens 100-103)
  {
    path: '/reports/operational',
    element: (
      <ProtectedLayout>
        <OperationalReportPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/reports/revenue',
    element: (
      <ProtectedLayout>
        <PlatformRevenuePage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/reports/users',
    element: (
      <ProtectedLayout>
        <UserAnalyticsPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/reports/compliance',
    element: (
      <ProtectedLayout>
        <ComplianceReportPage />
      </ProtectedLayout>
    ),
  },

  // Settings
  {
    path: '/settings',
    element: (
      <AuthGuard requiredRoles={['SUPER_ADMIN', 'OPERATIONS_MANAGER']}>
        <AppShell>
          <SettingsPage />
        </AppShell>
      </AuthGuard>
    ),
  },

  // Module 1 — Roles & Permissions matrix
  {
    path: '/settings/roles',
    element: (
      <ProtectedLayout>
        <RolesPermissionsPage />
      </ProtectedLayout>
    ),
  },

  // Module 1, Increment 1.1 — Permission Catalog (SUPER_ADMIN, platform.permissions.manage)
  {
    path: '/settings/permissions',
    element: (
      <ProtectedLayout>
        <PermissionCatalogPage />
      </ProtectedLayout>
    ),
  },

  // Menu Management — data-driven sidebar CRUD (SUPER_ADMIN, platform.permissions.manage)
  {
    path: '/settings/navigation',
    element: (
      <ProtectedLayout>
        <NavigationManagementPage />
      </ProtectedLayout>
    ),
  },

  // Module 1, Increment 1.4 Phase A — Reference Data (SUPER_ADMIN, platform.refdata.manage)
  {
    path: '/settings/reference-data',
    element: (
      <ProtectedLayout>
        <ReferenceDataPage />
      </ProtectedLayout>
    ),
  },

  // Module 1 — Platform Organizations (SUPER_ADMIN)
  {
    path: '/admin/organizations',
    element: (
      <ProtectedLayout>
        <OrganizationsPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/admin/organizations/:orgId',
    element: (
      <ProtectedLayout>
        <OrganizationDetailPage />
      </ProtectedLayout>
    ),
  },

  // Audit Log (admin.dashboard.read)
  {
    path: '/admin/audit-log',
    element: (
      <ProtectedLayout>
        <AuditLogPage />
      </ProtectedLayout>
    ),
  },
  // System Health page (GAP-038/GAP-052 — admin.dashboard.read, SUPER_ADMIN)
  {
    path: '/admin/system-health',
    element: (
      <ProtectedLayout>
        <SystemHealthPage />
      </ProtectedLayout>
    ),
  },

  // MCA Compliance — Edit Log (accounting.editlog.read)
  {
    path: '/compliance/edit-log',
    element: (
      <ProtectedLayout>
        <EditLogPage />
      </ProtectedLayout>
    ),
  },

  // Callbacks (Phase 6E)
  {
    path: '/callbacks',
    element: (
      <ProtectedLayout>
        <CallbackListPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/callbacks/kpi',
    element: (
      <ProtectedLayout>
        <CallbackKpiPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/callbacks/:id',
    element: (
      <ProtectedLayout>
        <CallbackDetailPage />
      </ProtectedLayout>
    ),
  },

  // CG-8 — full-page Notification Center (any authenticated user; own inbox)
  {
    path: '/notifications',
    element: (
      <ProtectedLayout>
        <NotificationsPage />
      </ProtectedLayout>
    ),
  },

  // Wave 7 — GAP-037 Notification Templates
  {
    path: '/notifications/templates',
    element: (
      <ProtectedLayout>
        <TemplateListPage />
      </ProtectedLayout>
    ),
  },
  {
    // Editor: /notifications/templates/:id (UUID — reconciled to backend id:guid routing)
    path: '/notifications/templates/:id',
    element: (
      <ProtectedLayout>
        <TemplateEditorPage />
      </ProtectedLayout>
    ),
  },

  // Wave 7 — GAP-031 CA Consultations
  {
    path: '/ca/availability',
    element: (
      <ProtectedLayout>
        <CaAvailabilityPage />
      </ProtectedLayout>
    ),
  },
  {
    path: '/ca/appointments',
    element: (
      <ProtectedLayout>
        <CaAppointmentsPage />
      </ProtectedLayout>
    ),
  },

  // Catch-all → dashboard
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])
