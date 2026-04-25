# SnapAccount - Comprehensive Project Brief

> Produced by: Orchestrator (Phase 0)
> Date: 2026-03-29
> Status: APPROVED — ready for all agents

---

## 1. Project Overview

**SnapAccount** is a mobile-first SaaS platform for Indian SMEs that makes accounting, GST filing, ITR filing, and loan processing as easy as clicking a photo. The USP is **Technology + Human Service** — users need zero accounting knowledge; they just photograph bills and the system handles the rest via OCR, AI, and a backend operations team.

**Target Market:** Indian Small and Medium Enterprises (SMEs), salaried employees (for ITR filing)
**Regulatory Context:** Indian GST regime, Income Tax Act, RBI lending guidelines, DPDP Act 2023 (India's data protection law)

---

## 2. User Types & Roles

| # | Role | Platform | Description |
|---|------|----------|-------------|
| 1 | Business Owner (SME) | Mobile App | Primary user — photographs bills, views dashboard, approves GST, applies for loans |
| 2 | Employee (Salaried) | Mobile App | Uploads tax documents for ITR filing |
| 3 | Data Entry Operator | Web Admin | Verifies OCR data, makes accounting entries |
| 4 | Support Executive | Web Admin | Calls users, provides human-touch support, files GST/ITR |
| 5 | Chartered Accountant (CA) | Web Admin | Reviews financials, tax computations, expert chat |
| 6 | Operations Manager | Web Admin | Manages team, monitors KPIs, handles escalations |
| 7 | System Administrator | Web Admin | Platform configuration, user management, system health (ADDED) |
| 8 | Partner Bank Representative | Web Admin (limited) | Views loan applications, updates status (ADDED) |

---

## 3. Complete Feature List

### Module 1: Onboarding & User Management
| # | Feature | Sub-features |
|---|---------|-------------|
| 1.1 | OTP Registration | Phone validation (starts 6/7/8/9, 10 digits), 6-digit OTP, 5-min validity, 3 attempts, 30-min cooldown |
| 1.2 | Auto-Read OTP | SMS Retriever API (Android), iOS auto-fill |
| 1.3 | Device Binding | Max 2 active devices per account, device management UI |
| 1.4 | JWT Authentication | Access token (1hr), refresh token (30d), token rotation |
| 1.5 | Business Profile Wizard | PAN verification API, GSTIN linking API, KYC/Aadhaar OTP verification |
| 1.6 | Employee Profile Setup | PAN, DOB, Aadhaar, employer details, bank account |
| 1.7 | Multi-Organization Support | ADDED — User can manage multiple businesses |
| 1.8 | Role-Based Access Control | Granular permissions per role per organization |
| 1.9 | User Preferences | Language, notification preferences, theme |
| 1.10 | Account Deactivation/Deletion | ADDED — DPDP Act compliance, right to erasure |

### Module 2: Document Vault
| # | Feature | Sub-features |
|---|---------|-------------|
| 2.1 | In-App Camera | Auto-edge detection, auto-crop, auto-enhance, multi-page capture |
| 2.2 | Gallery Upload | JPG/PNG/PDF, 5MB max per file |
| 2.3 | Bulk Document Upload | ADDED — Upload multiple documents at once |
| 2.4 | Document Categorization | Sales Bill, Purchase Bill, Expense Receipt, Bank Statement, Salary Slip, Other |
| 2.5 | OCR Processing | Azure Document Intelligence, confidence scoring (green >80%, yellow 50-80%, red <50%) |
| 2.6 | OCR Feedback Loop | ADDED — Operators can flag OCR errors to improve future accuracy |
| 2.7 | Manual Override (Admin) | Split-screen admin view for OCR correction |
| 2.8 | Cloud Storage | AES-256 encryption, signed URLs (1hr expiry) |
| 2.9 | Document Status Tracking | UPLOADED -> OCR_COMPLETE -> IN_REVIEW -> PROCESSED -> REJECTED |
| 2.10 | Search & Filter | By date, category, status, amount, vendor |
| 2.11 | 7-Year Retention | Archival policy with automatic lifecycle management |
| 2.12 | Document Tagging | ADDED — Custom tags for organization |
| 2.13 | Document Sharing | ADDED — Share specific documents with CA or bank |

### Module 3: Financial Health Dashboard
| # | Feature | Sub-features |
|---|---------|-------------|
| 3.1 | Key Metric Cards | Sales, Expenses, Net P/L, GST Payable |
| 3.2 | Charts & Graphs | Sales vs Expense (monthly/weekly/daily), trend lines |
| 3.3 | Recent Activity Feed | Latest transactions and document uploads |
| 3.4 | Financial Reports | Trial Balance, P&L, Balance Sheet, Cash Flow, Tax Liability, Ledger |
| 3.5 | PDF Export | SnapAccount branding, professional formatting |
| 3.6 | Share Reports | WhatsApp, Email, "Share with Bank" formatting |
| 3.7 | Financial Year Closing | ADDED — Year-end closing process, opening balance carry-forward |
| 3.8 | Data Export for CA/Auditor | ADDED — Export in Tally-compatible or standard formats |
| 3.9 | Comparative Analysis | ADDED — Year-over-year, month-over-month comparisons |
| 3.10 | Cash Flow Forecasting | ADDED — AI-powered cash flow predictions |

### Module 4: GST Filing
| # | Feature | Sub-features |
|---|---------|-------------|
| 4.1 | GSTR-3B Auto-Calculation | Taxable/exempt sales, ITC, output tax (CGST/SGST/IGST), net payable |
| 4.2 | Tax Rate Handling | 0% / 5% / 12% / 18% / 28% with versioning for rate changes |
| 4.3 | GSTR-1 Filing | Invoice-level B2B, aggregated B2C, credit/debit notes, HSN/SAC codes |
| 4.4 | GSTR-2A/2B Reconciliation | ADDED — Auto-match purchase invoices with GSTR-2A/2B data |
| 4.5 | Approval Workflow | DRAFT -> PENDING_APPROVAL -> APPROVED -> FILED -> REVISION_NEEDED |
| 4.6 | Human-Touch Callback System | 9 triggers: missing bills, rate mismatch, ITC mismatch, incomplete billing, first-time, discrepancy, GST notice, deadline, user-requested |
| 4.7 | Callback Workflow & KPIs | FCR >70%, avg 5-12 min, response <4hrs, satisfaction >4.5/5 |
| 4.8 | Filing Reminders | 7d / 3d / 1d before deadline |
| 4.9 | Late Fee Warnings | Auto-calculate late fees for missed deadlines |
| 4.10 | ITC Mismatch Alerts | Alert when ITC claimed differs from GSTR-2A/2B |
| 4.11 | Annual GSTR-9 | Annual return reminder and preparation |
| 4.12 | E-Invoicing | ADDED — Mandatory for turnover >5Cr, IRN generation via NIC portal |
| 4.13 | E-Way Bill | ADDED — Generation for goods movement >50K |
| 4.14 | GST Notice Handling | ADDED — Track and respond to GST notices |
| 4.15 | TDS Under GST | ADDED — TDS deduction and filing for applicable businesses |

### Module 5: Loan Hub
| # | Feature | Sub-features |
|---|---------|-------------|
| 5.1 | Loan Types | Business, Working Capital, Personal, MSME-Mudra |
| 5.2 | Eligibility Check | Vintage, turnover, GST compliance, KYC, financial health |
| 5.3 | Auto-Generated Document Package | 12-month GSTR-3B + BS + P&L + Bank Statement + KYC as single watermarked PDF |
| 5.4 | Application Workflow | INITIATED -> DOCUMENTS_READY -> SUBMITTED -> UNDER_REVIEW -> ADDITIONAL_DOCS_NEEDED -> APPROVED -> DISBURSED -> REJECTED |
| 5.5 | Consent Management | Explicit consent with timestamp/IP/device, revocable |
| 5.6 | Partner Bank API Integration | Submit applications, receive status updates |
| 5.7 | Loan Comparison | ADDED — Compare offers from multiple partner banks |
| 5.8 | EMI Calculator | ADDED — Calculate EMI for different loan amounts/tenures |
| 5.9 | Loan Tracking Dashboard | ADDED — Track all active loans, EMI schedule, payment reminders |

### Module 6: Employee ITR Filing
| # | Feature | Sub-features |
|---|---------|-------------|
| 6.1 | Employee Profile | PAN, DOB, Aadhaar, employer, bank details |
| 6.2 | Document Collection | Form 16 A+B, Form 16A, Form 26AS/AIS, deduction proofs (80C/80D/HRA/Home Loan/Capital Gains/NPS/80G) |
| 6.3 | Smart Personalized Checklist | AI-driven checklist based on employee profile |
| 6.4 | Backend Verification | PAN match, name match, FY check, completeness, readability, amount cross-check |
| 6.5 | Human-Touch Callback | 6 triggers: missing docs, rejected docs, clarification, multiple employers, complex situations, user-requested |
| 6.6 | Callback KPIs | FCR >75%, avg 8-12 min, response <4hrs, satisfaction >4.5/5 |
| 6.7 | Tax Computation Engine | Salary, house property, capital gains, other sources |
| 6.8 | Old vs New Regime | FY 2024-25 slabs, auto-calculation for both |
| 6.9 | Regime Comparison & Recommendation | Side-by-side comparison with AI recommendation |
| 6.10 | ITR Summary & Approval | DRAFT -> PENDING_APPROVAL -> USER_APPROVED -> FILING_IN_PROGRESS -> FILED -> E_VERIFIED -> COMPLETED |
| 6.11 | E-Verification | Aadhaar OTP, net banking, EVC, digital signature |
| 6.12 | E-Verification Reminders | Day 1/7/15/25/29 after filing |
| 6.13 | Refund Tracking | Visual timeline of refund status |
| 6.14 | Notice Handling | 143(1), 139(9), 143(2), 156 |
| 6.15 | Previous Year ITR Import | ADDED — Import prior year data for continuity |

### Module 7: Expert Chat & CA Consultation
| # | Feature | Sub-features |
|---|---------|-------------|
| 7.1 | Real-Time Chat | SignalR, WhatsApp-style UI, text + image + PDF |
| 7.2 | Typing Indicator & Read Receipts | Real-time presence |
| 7.3 | Query Routing | By category: GST/ITR/Compliance/Loans/General -> specialized CA |
| 7.4 | Chat History & Search | With bookmarks |
| 7.5 | Video Call Booking | Google Meet/Zoom integration, calendar integration |
| 7.6 | Appointment Management | Reschedule, cancel, rating (1-5 stars) |
| 7.7 | AI-Powered First Response | ADDED — AI chatbot for common queries before routing to CA |
| 7.8 | Chat Analytics | ADDED — Response time, resolution rate, satisfaction tracking |

### Module 8: Notifications & Communication (Cross-Cutting)
| # | Feature | Sub-features |
|---|---------|-------------|
| 8.1 | Push Notifications | FCM (Android), APNs (iOS) |
| 8.2 | SMS Notifications | Twilio/MSG91 |
| 8.3 | Email Notifications | SendGrid/SES |
| 8.4 | In-App Notifications | Notification center with read/unread |
| 8.5 | WhatsApp Business API | ADDED — Business messaging for reminders and updates |
| 8.6 | Notification Preferences | Per-channel, per-event-type user preferences |
| 8.7 | Notification Templates | ADDED — Templated messages with variable substitution |

### Module 9: Subscription & Billing (ADDED)
| # | Feature | Sub-features |
|---|---------|-------------|
| 9.1 | Subscription Plans | Free tier, Basic, Pro, Enterprise |
| 9.2 | Payment Gateway | Razorpay/Cashfree integration for subscription payments |
| 9.3 | Invoice Generation | Auto-generated invoices for subscription |
| 9.4 | Usage Metering | Track API calls, document uploads, chat sessions |
| 9.5 | Plan Upgrades/Downgrades | Pro-rated billing |
| 9.6 | Trial Period Management | Free trial with conversion nudges |

### Module 10: Audit & Compliance (ADDED)
| # | Feature | Sub-features |
|---|---------|-------------|
| 10.1 | Audit Logging | Who did what, when — required for CA compliance |
| 10.2 | Data Export | Structured export for auditor/CA handoff |
| 10.3 | DPDP Act Compliance | Consent management, data retention, right to erasure |
| 10.4 | Audit Trail for Financial Data | Immutable log of all financial modifications |
| 10.5 | Compliance Dashboard | ADDED — Track compliance status across all modules |

### Module 11: Analytics & Business Intelligence (ADDED)
| # | Feature | Sub-features |
|---|---------|-------------|
| 11.1 | Admin Analytics Dashboard | User growth, document volume, filing rates, revenue |
| 11.2 | Operational KPI Tracking | SLA adherence, callback metrics, processing times |
| 11.3 | Revenue Analytics | Subscription revenue, churn, LTV |
| 11.4 | User Behavior Analytics | Feature adoption, drop-off points |

### Module 12: TDS Management (ADDED)
| # | Feature | Sub-features |
|---|---------|-------------|
| 12.1 | TDS Computation | Auto-calculate TDS on payments |
| 12.2 | TDS Return Filing | Quarterly TDS returns (24Q, 26Q, 27Q) |
| 12.3 | TDS Certificate Generation | Form 16/16A generation for deductees |
| 12.4 | TDS Reconciliation | Match with Form 26AS |

---

## 4. Complete Screen List

### 4.1 Mobile App Screens

**Auth & Onboarding**
1. Splash Screen
2. Phone Number Entry
3. OTP Verification
4. Business Profile Wizard (multi-step: PAN -> GSTIN -> KYC -> Business Details)
5. Employee Profile Setup (PAN -> Aadhaar -> Employer -> Bank)
6. Language Selection
7. Permission Requests (Camera, Notifications, Storage)

**Home & Dashboard**
8. Home Screen (4 metric cards, chart, activity feed)
9. Financial Reports List
10. Report Detail (Trial Balance, P&L, Balance Sheet, Cash Flow, Tax Liability, Ledger)
11. Report PDF Preview & Share

**Document Vault**
12. Document List (with search/filter)
13. Camera Capture (with edge detection, multi-page)
14. Gallery Upload (multi-select)
15. Document Detail (OCR results, status, metadata)
16. Document Category Selection

**GST Filing**
17. GST Dashboard (pending returns, ITC mismatch alerts)
18. GSTR-3B Summary & Edit
19. GSTR-1 Invoice List & Edit
20. GST Approval Screen
21. Filing Confirmation & Receipt
22. GST Notice List
23. E-Invoice Generation (ADDED)
24. E-Way Bill Generation (ADDED)

**Loan Hub**
25. Loan Types Selection
26. Eligibility Check Screen
27. Document Package Preview
28. Loan Application Form
29. Consent Screen
30. Loan Status Tracking
31. EMI Calculator (ADDED)
32. Loan Comparison (ADDED)

**ITR Filing**
33. ITR Dashboard
34. Document Checklist (smart, personalized)
35. Document Upload (per checklist item)
36. Tax Computation Summary (Old vs New regime)
37. Regime Comparison Screen
38. ITR Approval Screen
39. E-Verification Screen
40. Refund Tracking Timeline
41. Notice List & Detail

**Expert Chat**
42. Chat List (conversations)
43. Chat Detail (WhatsApp-style)
44. Video Call Booking
45. Appointment List
46. CA Profile & Rating

**Notifications**
47. Notification Center
48. Notification Preferences

**Profile & Settings**
49. Profile Screen
50. Business Details Edit
51. Device Management
52. Language Settings
53. Subscription & Billing (ADDED)
54. Help & Support
55. About / Legal

### 4.2 Web Admin Screens

**Auth**
56. Admin Login
57. Forgot Password / Reset

**Dashboard**
58. Admin Dashboard (pending docs, GST returns, ITR verifications, callbacks, loan apps, chat queries, daily activity, team workload)

**Document Processing**
59. Document Queue (with SLA indicators)
60. Document Review (split-screen: original image + OCR data + editable fields)
61. Bulk Document Assignment
62. OCR Confidence Report

**GST Operations**
63. GST Filing Queue
64. GST Return Review (GSTR-3B detail)
65. GSTR-1 Review
66. ITC Mismatch Tracker
67. GST Callback Queue
68. GST Notice Tracker
69. E-Invoice Management (ADDED)

**ITR Operations**
70. ITR Verification Queue
71. ITR Document Review
72. Tax Computation Panel (Old vs New comparison)
73. ITR Filing Queue
74. ITR Callback Queue
75. ITR Notice Tracker

**Loan Operations**
76. Loan Application Queue
77. Document Package Review
78. Bank Communication Log
79. Disbursement Tracking

**Chat Management**
80. Chat Dashboard (active conversations, queue)
81. Chat Interface (admin side)
82. Video Call Calendar
83. Chat Analytics

**User Management**
84. User List (search, filter, export)
85. User Detail (profile, documents, transactions, subscriptions)
86. Organization Management (ADDED)

**Team Management**
87. Staff List (roles, performance)
88. Role & Permission Management
89. Workload Distribution
90. KPI Dashboard (callback metrics, SLA adherence)

**Subscription Management (ADDED)**
91. Plan Configuration
92. Subscriber List
93. Revenue Dashboard
94. Invoice Management

**System Configuration (ADDED)**
95. Notification Template Manager
96. Tax Rate Configuration (versioned)
97. HSN/SAC Code Manager
98. System Health Dashboard
99. Audit Log Viewer

**Reports & Analytics (ADDED)**
100. Operational Reports
101. Financial Reports (platform revenue)
102. User Analytics
103. Compliance Report

---

## 5. Domain Entity List

### Auth Service Entities
- User
- UserProfile
- UserDevice (max 2)
- OtpRequest
- RefreshToken
- Role
- Permission
- RolePermission
- UserRole
- Organization
- OrganizationMember

### Document Service Entities
- Document
- DocumentPage
- DocumentCategory
- OcrResult
- OcrField
- OcrFeedback
- DocumentTag
- DocumentShare
- DocumentArchive

### Accounting Service Entities
- Account (Chart of Accounts)
- JournalEntry
- JournalEntryLine
- Ledger
- FinancialPeriod
- TrialBalance
- BalanceSheet
- ProfitAndLoss
- CashFlowStatement
- OpeningBalance
- FinancialYearClose

### GST Service Entities
- GstReturn (GSTR-1, GSTR-3B, GSTR-9)
- GstReturnLineItem
- GstInvoice
- GstTaxRate (versioned — temporal table)
- HsnSacCode
- ItcRecord
- ItcMismatch
- GstCallback
- GstNotice
- EInvoice
- EWayBill
- GstReconciliation

### Loan Service Entities
- LoanApplication
- LoanType
- EligibilityCriteria
- DocumentPackage
- LoanConsent
- PartnerBank
- LoanOffer
- LoanDisbursement
- EmiSchedule

### ITR Service Entities
- ItrReturn
- ItrDocument
- ItrChecklist
- ItrChecklistItem
- TaxComputation
- TaxSlab (versioned — temporal table)
- TaxRegime
- EVerification
- ItrCallback
- ItrNotice
- ItrRefund
- TdsEntry
- TdsReturn

### Chat Service Entities
- Conversation
- Message
- MessageAttachment
- Appointment
- AppointmentSlot
- CaProfile
- CaRating
- ChatQuery

### Notification Service Entities
- Notification
- NotificationTemplate
- NotificationPreference
- DevicePushToken
- NotificationLog

### Report Service Entities
- Report
- ReportTemplate
- ReportSchedule
- ExportJob

### Subscription Service (ADDED) Entities
- SubscriptionPlan
- Subscription
- SubscriptionInvoice
- Payment
- UsageRecord

### Shared / Cross-Cutting Entities
- AuditLog
- SystemConfiguration
- FeatureFlag
- ApiRateLimit

---

## 6. Microservices Architecture

### Service Breakdown

| # | Service | Owns | Database Schema | Key GCP/Firebase Dependencies |
|---|---------|------|----------------|-------------------------------|
| 1 | **Auth Service** | Users, roles, permissions, devices, organizations, OTP | `auth` schema | Firebase Auth (phone OTP, Google/Apple sign-in), MSG91 (SMS) |
| 2 | **Document Service** | Documents, OCR results, storage | `document` schema | Cloud Storage, Google Document AI (OCR) |
| 3 | **Accounting Service** | Chart of accounts, journal entries, ledgers, financial statements | `accounting` schema | — |
| 4 | **GST Service** | GST returns, invoices, tax rates, reconciliation, e-invoicing, e-way bills | `gst` schema | GST Portal API, NIC E-Invoice API |
| 5 | **Loan Service** | Loan applications, eligibility, document packages, partner banks | `loan` schema | Partner Bank APIs (adapter pattern, configurable per bank) |
| 6 | **ITR Service** | ITR returns, tax computation, TDS, e-verification | `itr` schema | Income Tax Portal API |
| 7 | **Chat Service** | Conversations, messages, appointments, CA profiles | `chat` schema | SignalR (self-hosted on Cloud Run), Google Meet/Zoom API |
| 8 | **Notification Service** | Notifications, templates, preferences, push tokens | `notification` schema | FCM, APNs, SendGrid (email), MSG91 (SMS), WhatsApp Business API (feature-flag, off by default) |
| 9 | **Report Service** | Reports, exports, scheduled reports | `report` schema | Cloud Storage (generated PDFs) |
| 10 | **Subscription Service** (ADDED) | Plans, subscriptions, payments, usage | `subscription` schema | Razorpay (default, configurable via admin settings) |
| 11 | **AI Service** (ADDED) | RAG pipeline, embeddings, AI chat, Sarvam AI | `ai` schema (pgvector) | Vertex AI / Gemini API, Semantic Kernel SDK, Sarvam AI |

### Inter-Service Communication

- **Synchronous:** HTTP via .NET Aspire service discovery (for real-time queries)
- **Asynchronous:** Google Cloud Pub/Sub (for events that don't need immediate response)

**Key Event Flows:**
- Document Service -> `document.ocr.completed` -> Accounting Service (create journal entry)
- Document Service -> `document.ocr.completed` -> GST Service (update invoice data)
- GST Service -> `gst.return.filed` -> Notification Service (send confirmation)
- ITR Service -> `itr.filed` -> Notification Service (send e-verification reminder)
- Auth Service -> `user.registered` -> Notification Service (send welcome)
- Loan Service -> `loan.status.changed` -> Notification Service (send update)
- Chat Service -> `chat.message.received` -> Notification Service (send push)
- Subscription Service -> `subscription.expired` -> Notification Service (send renewal reminder)
- Subscription Service -> `subscription.changed` -> Auth Service (update plan limits)

### API Gateway

- Single entry point for all client requests
- Route to appropriate microservice
- JWT validation at gateway level
- Rate limiting at gateway level
- Request/response logging

---

## 7. Database-Per-Service Design

Each microservice owns its own PostgreSQL schema within a shared PostgreSQL cluster (cost-effective for initial deployment, can be split to separate databases later).

### Schema Design Principles
1. **snake_case** for all table and column names
2. **UUID** primary keys on all tables
3. **Audit columns** on every table: `created_at`, `updated_at`, `deleted_at` (soft delete), `created_by`, `updated_by`
4. **Row-Level Security (RLS)** on all user-owned data tables
5. **Temporal tables** for tax rates, slabs, and any government-regulated data (to track changes over time)
6. **Partitioning** for high-volume tables (documents, notifications, audit logs) — partition by date for 7-year retention
7. **pgvector extension** for AI/RAG embedding storage
8. **Indexes** on all foreign keys and frequently queried columns
9. **HNSW index** on vector columns for fast similarity search

### Schema Allocation

```
PostgreSQL Cluster
├── auth          (Auth Service)
├── document      (Document Service)
├── accounting    (Accounting Service)
├── gst           (GST Service)
├── loan          (Loan Service)
├── itr           (ITR Service)
├── chat          (Chat Service)
├── notification  (Notification Service)
├── report        (Report Service)
├── subscription  (Subscription Service)
├── ai            (AI Service — pgvector)
└── shared        (Shared lookup tables, audit log)
```

---

## 8. GCP + Firebase Services

| Service | Purpose |
|---------|---------|
| Cloud Run | Hosting all microservices (auto-scaling containers) |
| Artifact Registry | Docker image registry |
| Cloud SQL for PostgreSQL 17 | Primary database (India region for DPDP compliance) |
| Cloud Storage | Document storage (AES-256 encrypted at rest, signed URLs) |
| Secret Manager | Secrets and certificate management |
| Cloud Pub/Sub | Inter-service async messaging |
| Firebase Auth | User authentication (phone OTP, Google/Apple sign-in, 50K MAU free) |
| Google Document AI | OCR for bills, invoices, tax documents |
| Vertex AI / Gemini API | AI model (default: Gemini, swappable via admin config) |
| SignalR (self-hosted on Cloud Run) | Real-time chat |
| Google Cloud Monitoring + Firebase Crashlytics | Backend monitoring + mobile crash reporting |
| Cloud Armor + API Gateway | API gateway, WAF, rate limiting |
| Memorystore (Redis) | Session caching, rate limit counters |
| Cloud CDN | Static asset delivery |
| SendGrid (free tier) | Transactional email |

---

## 9. AI Features Needed

| Feature | Technology | Purpose |
|---------|-----------|---------|
| Document OCR | Google Document AI | Extract structured data from photos of bills, invoices, tax forms |
| RAG Pipeline | Semantic Kernel + pgvector + Vertex AI embeddings | Context-aware responses for expert chat, document search |
| AI Chatbot | Vertex AI / Gemini (default, swappable via admin config) | First-response AI for common queries before routing to CA |
| Tax Regime Recommendation | Rules engine + Gemini | Compare Old vs New regime, recommend optimal |
| Cash Flow Forecasting | Time-series analysis + Gemini | Predict future cash flows based on historical data |
| Smart Checklist | Rules + AI | Personalized ITR document checklist based on employee profile |
| OCR Confidence Scoring | Google Document AI | Confidence scoring with color coding (green >80%, yellow 50-80%, red <50%) |
| Indian Language Support | Sarvam AI (default English, Hindi, Bengali + all Indian state languages; configurable per user/admin) | Indian language NLP, translation, transliteration |
| Document Classification | Google Document AI / Custom | Auto-categorize uploaded documents |
| Anomaly Detection | Vertex AI | Flag unusual transactions or filing discrepancies |

---

## 10. External API Integrations

| API | Purpose |
|-----|---------|
| PAN Verification API (NSDL/UTIITSL) | Verify PAN during onboarding |
| GST Portal API | GSTIN verification, GSTR filing, GSTR-2A/2B download |
| NIC E-Invoice Portal | E-invoice generation (IRN) |
| NIC E-Way Bill Portal | E-way bill generation |
| Income Tax Portal API | ITR filing, e-verification |
| Aadhaar OTP API (UIDAI) | KYC verification |
| MSG91 | OTP delivery, transactional SMS |
| SendGrid (free tier) | Transactional email |
| FCM / APNs | Push notifications (Firebase Cloud Messaging) |
| WhatsApp Business API | Business messaging (feature-flagged, enabled via admin settings) |
| Partner Bank APIs | Loan application submission (adapter pattern — any bank added via admin config) |
| Razorpay | Payment processing for subscriptions (default; credentials configured by admin; no account needed at dev time) |
| Google Meet API | Video call scheduling |
| Zoom API | Video call alternative |
| Sarvam AI API | Indian language NLP (Hindi, Bengali, Gujarati, Tamil, Telugu, Kannada, Marathi, Malayalam, Punjabi, Odia — excludes non-standard dialects like Bhojpuri, Maithili) |
| Vertex AI / Gemini API | Default AI model (swappable via admin config — no vendor lock-in) |
| Tally XML Export | Export financial data in Tally-compatible format (feature-flagged, enabled via admin settings) |

---

## 11. Indian Government Compliance Considerations

1. **GST Compliance**
   - Tax rates change via government notification — must use versioned/temporal tables
   - E-invoicing mandatory for businesses with turnover >5Cr (threshold keeps lowering)
   - E-way bill mandatory for goods movement >50K
   - GSTR filing deadlines are fixed per month — system must enforce
   - ITC matching with GSTR-2A/2B is mandatory

2. **Income Tax Compliance**
   - Tax slabs change annually in Union Budget — must use versioned tables
   - New vs Old regime rules change frequently
   - Section 87A rebate rules change
   - E-verification within 30 days of filing is mandatory
   - Form 26AS/AIS reconciliation is important
   - TDS rates change via circulars

3. **Data Protection (DPDP Act 2023)**
   - Explicit consent required before processing personal data
   - Right to erasure (account deletion)
   - Data localization — Indian user data must stay in India (use GCP asia-south1 Mumbai region)
   - Breach notification within 72 hours
   - Data retention limits — justify 7-year retention based on tax law requirements

4. **RBI / Banking Regulations**
   - Loan data sharing requires explicit consent
   - Partner bank integrations must comply with RBI digital lending guidelines
   - Consent must be revocable
   - Interest rate display requirements

5. **KYC / Aadhaar**
   - Aadhaar-based KYC must follow UIDAI guidelines
   - eKYC consent flow required
   - Aadhaar number must be masked in storage and display

6. **Chartered Accountant Regulations**
   - ICAI guidelines on digital signatures
   - Audit trail requirements for financial data
   - CA verification workflows must maintain professional standards

---

## 12. Technology Stack (Final — Latest Versions)

| Layer | Technology |
|-------|-----------|
| Backend | .NET 10, C# 14, ASP.NET Core 10, EF Core 10 |
| Architecture | Clean Architecture, CQRS (MediatR), Domain-Driven Design |
| Orchestration | .NET Aspire |
| Frontend (Web) | React 19, TypeScript 5.7+, TanStack Query, React Router v7, Tailwind CSS v4 |
| Mobile | React Native (Expo SDK 52+), TypeScript, React Navigation v7, NativeWind |
| Database | PostgreSQL 17 + pgvector |
| Cloud | GCP (Cloud Run, Cloud Storage, Cloud SQL, Pub/Sub, Secret Manager, Artifact Registry) — asia-south1 (Mumbai) |
| Auth | Firebase Auth (phone OTP, Google/Apple sign-in, 50K MAU free tier) |
| AI | Semantic Kernel SDK + Vertex AI / Gemini API (default, swappable), Google Document AI (OCR), Sarvam AI (Indian languages) |
| Monitoring | Firebase Crashlytics (mobile), Google Cloud Monitoring (backend) |
| Real-Time | SignalR (self-hosted on Cloud Run) |
| Background Jobs | Hangfire |
| Notifications | FCM (push), MSG91 (SMS), SendGrid free tier (email) |
| Payments | Razorpay (default, configurable via admin settings) |
| CI/CD | GitHub Actions |
| Containerization | Docker, docker-compose |

---

## 13. Decisions Log (Previously Open Questions — All Resolved 2026-04-04)

1. **Payment Gateway** — **Razorpay** selected. No account yet — build full integration, credentials configured by admin at runtime via admin settings panel. Users never see hardcoded keys.

2. **WhatsApp Business API** — **Included but feature-flagged OFF by default.** Admin can enable via settings form UI when account/credentials are ready. No code skip — full implementation, just toggled off at launch.

3. **Multi-Language Support** — **Default: English, Hindi, Bengali.** All Indian state languages supported (Hindi, Bengali, Gujarati, Tamil, Telugu, Kannada, Marathi, Malayalam, Punjabi, Odia). Excludes non-standard dialects (Bhojpuri, Maithili, etc.). Language changeable by user in profile settings. Admin can configure platform-level defaults.

4. **Partner Banks** — **No confirmed banks yet.** Build using adapter pattern — each bank is a pluggable adapter. Admin can add/configure any bank via admin settings without code changes. Scope is fully open.

5. **Tally Integration** — **Included, feature-flagged via admin settings.** Export financial data in Tally XML format. Admin enables when needed.

6. **Cloud Region** — **GCP asia-south1 (Mumbai)** as primary region. Meets DPDP Act 2023 data localization requirement. (Cloud provider changed from Azure to GCP — see §8.)

7. **Subscription Tiers** — **Monthly and yearly billing via Razorpay.** Tiers and feature-gating fully configurable by admin via settings. No hardcoded tier logic — all driven by config. Specific tier names/prices to be defined by admin at launch.

**Design principle across all above:** Every integration point (payment gateway, language pack, feature flags, bank adapters, AI model, notification channels) must be configurable by admin or authorized roles via the admin panel settings UI — zero code deployments needed to toggle or reconfigure.

---

## 14. Key Directories (Final)

```
snapaccount/
├── backend/
│   ├── src/
│   │   ├── Domain/              — Entities, value objects, enums, domain events
│   │   ├── Application/         — CQRS commands/queries, DTOs, interfaces, validators
│   │   ├── Infrastructure/      — EF Core, Azure clients, AI services, external APIs
│   │   │   └── Migrations/      — Database migrations
│   │   ├── WebApi/              — API endpoints, middleware, DI
│   │   ├── AuthService/         — Auth microservice entry point
│   │   ├── DocumentService/     — Document microservice entry point
│   │   ├── AccountingService/   — Accounting microservice entry point
│   │   ├── GstService/          — GST microservice entry point
│   │   ├── LoanService/         — Loan microservice entry point
│   │   ├── ItrService/          — ITR microservice entry point
│   │   ├── ChatService/         — Chat microservice entry point
│   │   ├── NotificationService/ — Notification microservice entry point
│   │   ├── ReportService/       — Report microservice entry point
│   │   ├── SubscriptionService/ — Subscription microservice entry point
│   │   └── AiService/           — AI/RAG microservice entry point
│   ├── AppHost/                 — .NET Aspire AppHost
│   ├── ServiceDefaults/         — Shared Aspire defaults
│   └── tests/                   — Unit + integration tests
├── src/admin/                   — React web admin panel
├── mobile/                      — React Native mobile app
├── docs/
│   ├── orchestrator/            — Project brief, status, delivery summary
│   ├── database/                — Schema documentation
│   ├── design/                  — UI/UX tokens, components, screens
│   ├── api/                     — API contract documentation
│   ├── devops/                  — Setup guides
│   ├── qa/                      — Test reports
│   └── security/                — Security audit report
├── infra/                       — GCP Terraform / gcloud CLI scripts
├── .github/workflows/           — CI/CD pipelines (GitHub Actions → Artifact Registry → Cloud Run)
├── docker-compose.yml           — Local development
├── docker-compose.override.yml  — Dev overrides
└── aspire-manifest.json         — .NET Aspire deployment manifest
```

---

## 15. Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| GST rate/form changes mid-development | High | Temporal tables, versioned tax configurations |
| Third-party API downtime (GST Portal, IT Portal) | High | Circuit breaker pattern, retry policies, queue failed requests |
| Data breach of financial PII | Critical | AES-256, RLS, audit logging, DPDP compliance, GCP security (Cloud Armor, Secret Manager, VPC) |
| OCR accuracy below threshold | Medium | Human-in-the-loop verification, OCR feedback loop |
| Partner bank API variability | Medium | Adapter pattern per bank, standardized internal interface |
| GCP region outage | High | Cloud Run multi-region failover consideration, Cloud SQL backups |
| Scaling under GST filing deadline load | High | Auto-scaling Cloud Run, Pub/Sub queue-based processing |

---

*End of Project Brief*
