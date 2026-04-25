import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/shared/AuthGuard'
import { ForbiddenPage } from '@/components/shared/RoleGuard'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import DocumentQueuePage from '@/pages/documents/DocumentQueuePage'
import DocumentReviewPage from '@/pages/documents/DocumentReviewPage'
import GstFilingQueuePage from '@/pages/gst/GstFilingQueuePage'
import GstReturnReviewPage from '@/pages/gst/GstReturnReviewPage'
import ItcMismatchPage from '@/pages/gst/ItcMismatchPage'
// Phase 6B — GST Notice Tracker
import NoticeTrackerListPage from '@/pages/gst/NoticeTrackerListPage'
import NoticeDetailPage from '@/pages/gst/NoticeDetailPage'
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
import TeamPage from '@/pages/team/TeamPage'
import SubscriptionsPage from '@/pages/subscriptions/SubscriptionsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
// Phase 6E — Callbacks
import CallbackListPage from '@/pages/callbacks/CallbackListPage'
import CallbackDetailPage from '@/pages/callbacks/CallbackDetailPage'
import CallbackKpiPage from '@/pages/callbacks/CallbackKpiPage'

// Layout wrapper for protected routes
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>
        {children}
      </AppShell>
    </AuthGuard>
  )
}

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <LoginPage />,
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
  {
    path: '/chat',
    element: (
      <ProtectedLayout>
        <ChatPage />
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

  // Subscriptions — Phase 6F full build (ADMIN only)
  {
    path: '/subscriptions',
    element: (
      <ProtectedLayout>
        <SubscriptionsPage />
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

  // Settings
  {
    path: '/settings',
    element: (
      <AuthGuard requiredRoles={['SYSTEM_ADMIN', 'OPERATIONS_MANAGER']}>
        <AppShell>
          <SettingsPage />
        </AppShell>
      </AuthGuard>
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

  // Catch-all → dashboard
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])
