<!-- converted from SnapAccount_Complete_Project_Plan (1) (1).docx -->



SnapAccount
SME Financial Solution App


"A mobile application that makes accounting, GST filing, and loan processing as easy as clicking a photo for Small and Medium Enterprises (SMEs)."
USP: Technology + Human Service — Users don't need accounting knowledge, they just take photos!




# Table of Contents

Part A: Project Overview & Vision
- Problem Statement
- Solution Overview
- User Types & Roles
- System Architecture (High Level)
- Technology Stack Summary
Part B: Module 1 — Onboarding & User Management
Part C: Module 2 — Document Vault
Part D: Module 3 — Financial Health Dashboard
Part E: Module 4 — GST Filing (incl. Human-Touch Callback)
Part F: Module 5 — Loan Hub
Part G: Module 6 — Employee ITR Filing
Part H: Module 7 — Expert Chat & CA Consultation
Part I: Notifications & Communication System
Part J: Admin Panel (All Modules)
Part K: Complete User Journeys
Part L: Glossary of Terms for Developers






# Problem Statement

Small and medium business owners in India face significant daily challenges that eat into their time, money, and peace of mind:
- Complex accounting: Most SME owners are not accountants. They don't know how to maintain books of accounts, create a Trial Balance, or produce a Profit & Loss statement. They run their business based on rough mental calculations.
- Confusing GST filing: India's GST system requires monthly/quarterly returns (GSTR-1, GSTR-3B). Getting the numbers wrong leads to penalties. Many owners pay CAs thousands of rupees every month just for GST compliance.
- Difficulty getting loans: Banks need organized financial records (Balance Sheet, P&L;, GSTR returns) to approve loans. Most SMEs don't have these documents in proper format, so their loan applications get rejected.
- Expensive CA services: A Chartered Accountant charges Rs. 5,000-20,000/month for basic bookkeeping and GST filing. Small businesses with turnover of Rs. 20-50 Lakhs can't afford this.
- Stressful ITR filing: Salaried employees of these SMEs also struggle with personal Income Tax Return filing — they don't know which documents to upload, which regime to choose, or how to claim deductions.


# Solution Overview

SnapAccount is a mobile-first platform where users simply photograph their bills, invoices, and bank statements. Our backend team (real humans + CAs) processes this data to provide:





# User Types & Roles

Understanding who uses the app is critical before building any feature:



# System Architecture (High Level)

The system has four main layers. As a developer, you should know which layer you're working on:





# Technology Stack Summary














This module handles everything related to getting a new user into the system. It's the first impression of SnapAccount, so it must be smooth, fast, and error-free.


# B1. Mobile Registration (Feature)

## B1.1 OTP-Based Phone Verification (Sub-Feature)
- User opens the app and enters their 10-digit Indian mobile number
- System validates the format (must start with 6/7/8/9, exactly 10 digits)
- System sends a 6-digit OTP via SMS to that number
- OTP is valid for 5 minutes (configurable)
- User gets 3 attempts to enter the correct OTP
- After 3 failed attempts  Cooldown period of 30 minutes
- On successful verification  Account is created (if new) or user is logged in (if existing)


## B1.2 Auto-Read OTP (Sub-Feature)
- On Android: Use SMS Retriever API to auto-read OTP without asking SMS permission
- On iOS: iOS auto-suggests OTP from Messages (built-in, no extra work needed)
- If auto-read fails  User manually types the OTP


## B1.3 Device Binding (Sub-Feature)
- After first successful login, the device is registered (device ID stored)
- If user logs in from a new device  Extra security: OTP + confirmation on old device
- Maximum 2 active devices per account


## B1.4 Session Management (Sub-Feature)
- On successful login  System issues a JWT access token (expires in 1 hour) and a refresh token
(expires in 30 days)
- Every API call includes the access token in the header
- When access token expires  App silently uses refresh token to get a new access token
- On logout  Both tokens are invalidated



# B2. Business Profile Setup (Feature)



After registration, the business owner fills in their profile. This is shown as a step-by-step wizard (not one long form) so it feels easy and non-overwhelming.


## B2.1 Basic Business Information (Sub-Feature)


B2.2 PAN Verification (Sub-Feature)
- When user enters PAN  Call external PAN verification API
- Check: Is PAN valid? Is it Active? Does the name match?
- If PAN is Inactive or Inoperative  Show message: 'Please link your Aadhaar with PAN first'
- If name doesn't match  Show warning, ask user to correct
- Store verification status: VERIFIED / FAILED / PENDING


## B2.3 GSTIN Linking (Sub-Feature)
- Optional field — only for GST-registered businesses
- When user enters GSTIN  Verify against GST portal API
- Auto-fill business name and address from GSTIN data
- If GSTIN is invalid or doesn't match PAN  Show error


- For businesses NOT registered for GST  Skip this step, but show a note about GST registration threshold (Rs. 40L goods / 20L services)


## B2.4 KYC / Aadhaar Verification (Sub-Feature)
- Required only for Loan Hub and ITR Filing features
- Can be done later (not mandatory during initial signup)
- Aadhaar OTP-based verification (no physical documents needed)
- Store: Aadhaar number (encrypted), verification status, verification timestamp








This is the heart of SnapAccount. Everything starts here. The user photographs their bills and invoices, and our system + backend team turns those photos into proper accounting entries.


# C1. Document Capture (Feature)

## C1.1 In-App Camera (Sub-Feature)
- Custom camera screen (not the default phone camera) with document-friendly features
- Auto-edge detection: Automatically detects the edges of the bill/paper and highlights them
- Auto-crop: Crops the image to just the document, removing background
- Auto-enhance: Improves brightness and contrast for better OCR accuracy
- Flash toggle: For dark environments
- Multi-page capture: Some invoices have multiple pages — let user capture multiple photos for one document
- Preview before saving — user can retake if blurry


## C1.2 Gallery Upload (Sub-Feature)
- User picks an existing image from phone gallery
- Supports JPG, JPEG, PNG (images) and PDF (documents)
- Maximum file size: 5 MB per file
- Multi-select: User can pick multiple files at once


## C1.3 Document Categorization (Sub-Feature)
After capturing/selecting a document, user must categorize it. Show a simple picker:






# C2. OCR Processing (Feature)

OCR (Optical Character Recognition) automatically reads text from the uploaded photo/PDF. This speeds up the backend team's work — instead of typing everything manually, they just verify and correct the OCR output.


## C2.1 Data Extraction (Sub-Feature)
The OCR engine tries to extract these fields from each document:


## C2.2 OCR Confidence Scoring (Sub-Feature)
- Each extracted field gets a confidence score (0-100%)
- Fields with score > 80%  Auto-populated, shown in green to backend team
- Fields with score 50-80%  Shown in yellow (needs review)
- Fields with score < 50%  Shown in red (likely wrong, needs manual entry)
- Backend team corrects wrong values  Corrections are used to improve OCR over time


## C2.3 Manual Override by Backend Team (Sub-Feature)


- Even after OCR, the backend team always reviews and confirms the data
- Admin panel shows: Original image on the left, extracted data on the right (side by side)
- Team can edit any field, add missing fields, or mark the document as unreadable
- After correction  Data is posted to the accounting ledger



# C3. Document Storage & Management (Feature)

## C3.1 Cloud Storage (Sub-Feature)
- All files stored in Azure Blob Storage / AWS S3 (AES-256 encrypted at rest)
- Folder structure: /user_id/financial_year/category/filename
- Original files are NEVER modified. Processing creates separate metadata.
- Files are accessed via signed URLs (temporary links that expire after 1 hour)


## C3.2 Document Status Tracking (Sub-Feature)


C3.3 Document History & Search (Sub-Feature)
- User can view all uploaded documents in a chronological list
- Filter by: Category, Status, Date Range, Amount Range
- Search by: Party name, Invoice number, Amount
- Tap on any document to see: Original image + Extracted data + Accounting entry created
- 7-year document retention as per tax compliance requirements










This is what the business owner checks every day. It shows their business's financial health in simple, visual terms — no accounting knowledge needed. All data here comes from the documents processed in Module 2.


# D1. Dashboard Home Screen (Feature)

## D1.1 Key Numbers Summary (Sub-Feature)
At the top of the dashboard, show these 4 big numbers (cards):


## D1.2 Sales vs Expense Graph (Sub-Feature)
- Bar chart or line chart showing monthly sales vs expenses for the last 6-12 months
- User can toggle between: Monthly / Weekly / Daily view
- Tap on any bar to see detailed breakdown
- Show trend arrow: "Sales are 15% higher than last month" (or lower)


## D1.3 Recent Activity Feed (Sub-Feature)
- List of last 10 processed documents with: Date, Category, Amount, Party Name
- Each item is tappable  Opens the document detail
- Shows pending items count: "3 documents are still being processed"



# D2. Financial Reports (Feature)

These are the standard accounting reports that banks, CAs, and tax authorities need. Our backend team prepares these from the processed documents. Users don't create them — they just view them.





# D3. Report Downloads & Sharing (Feature)

## D3.1 PDF Export (Sub-Feature)
- Each report can be downloaded as a professional PDF with SnapAccount branding
- PDF includes: Business name, GSTIN, period, and all relevant data
- Period selection: User picks date range before downloading


## D3.2 Share Options (Sub-Feature)
- Share via WhatsApp, Email, or any app on the phone
- Direct email to CA: User enters CA's email, report is sent as PDF attachment
- "Share with Bank" option: Formats reports specifically for loan applications








GST (Goods & Services Tax) is India's indirect tax that every registered business must file monthly or quarterly. SnapAccount auto-calculates the return from the processed bills and files it on the GST portal after user approval.


# E1. GST Return Auto-Calculation (Feature)

## E1.1 GSTR-3B Calculation Engine (Sub-Feature)
The system automatically calculates these values from processed documents:


## E1.2 Tax Rate Handling (Sub-Feature)
Indian GST has multiple rates. Each bill's tax rate is captured during processing:



# E2. GST Return Approval Workflow (Feature)

## E2.1 Monthly/Quarterly Review (Sub-Feature)
- At the end of each filing period, system auto-generates the GSTR-3B draft
- User receives push notification: "Your GST return for [Month] is ready for review"
- User opens the return and sees a clean summary with all numbers
- Breakdown shown: Sales (taxable vs exempt), Purchases, ITC, Tax payable


## E2.2 Approval & Payment (Sub-Feature)
- User reviews numbers and taps 'Approve & File'
- If tax is payable  System shows payment options (redirect to GST portal payment)
- After payment  Backend team files the return on the GST portal
- ARN Number (Acknowledgment Reference Number) is generated and shared with user
- Status: DRAFT  PENDING_APPROVAL  APPROVED  FILED


E2.3 GST Return Statuses (Sub-Feature)


# E3. GSTR-1 (Sales Return) Filing (Feature)

GSTR-1 is a detailed return listing every sales invoice. It's more complex than GSTR-3B because every invoice must be listed separately.


## E3.1 Invoice-Level Data (Sub-Feature)
- Each sales bill creates one invoice record with: Invoice number, Date, Customer GSTIN, Taxable amount, GST amount, Tax rate
- B2B sales (business-to-business): Listed individually with buyer's GSTIN
- B2C sales (business-to-consumer): Aggregated by rate and state
- Credit notes and debit notes are tracked separately


## E3.2 HSN/SAC Summary (Sub-Feature)
- HSN Code (Harmonized System of Nomenclature) — code for goods
- SAC Code (Services Accounting Code) — code for services
- Each item sold must have an HSN/SAC code in GSTR-1
- System suggests codes based on business category; CA confirms



# E4. Human-Touch Callback System for GST (Feature)




## E4.1 When is a GST Callback Triggered? (Sub-Feature)
A callback request is created automatically or manually in these GST situations:

- Missing purchase bills: User has claimed ITC but corresponding purchase bills are not uploaded
- Tax rate mismatch: OCR or backend team detects a bill with an unusual tax rate for that product/service category
- ITC mismatch with GSTR-2A/2B: Supplier has not filed their return, so user's ITC claim doesn't match government records
- Incomplete billing details: Sales/Purchase bills missing GSTIN, invoice number, or HSN/SAC code
- First-time GST filing: New user filing GST for the first time — proactive call to explain the process
- Return discrepancy: Significant difference between current month and previous months (e.g., sudden 80% drop in sales)
- GST notice received: User or system detects a notice from the GST department
- Approaching deadline: Return not approved 2 days before the filing deadline
- User requested: User taps 'Talk to an Expert' or 'Request Callback' in the GST section


## E4.2 GST Callback Workflow (Sub-Feature)
Step-by-step process when a GST callback is triggered:

- Callback Created: System creates request with: reason, affected return period, specific issues found, user's GST filing history
- Assignment: Team Lead assigns to a Support Executive who has GST knowledge


- Preparation: Executive reviews: user's processed bills for that period, previous month's return, the specific issue flagged
- The Call: Executive calls the user with a friendly opening: 'Hi, this is SnapAccount support. We noticed a few things in your GST return for [Month] that we'd like to clarify.'
- Listen & Understand: Executive listens to the business owner. Maybe they forgot to upload a bill, or they sold a new product and aren't sure about the tax rate.
- Guide & Resolve: Executive guides the user: upload the missing bill, correct the category, explain ITC rules, etc.
- Escalation (if needed): Complex issues like ITC reversal, credit notes, or GST notices are escalated to the CA
- Notes & Follow-up: Call notes, resolution, and any pending actions are recorded. Follow-up scheduled if needed.


## E4.3 Common GST Callback Scenarios (Sub-Feature)
These are the most common problems business owners face with GST. Your UI and admin panel should handle all of these:




## E4.4 GST Callback Statuses (Sub-Feature)


E4.5 GST Callback KPIs (Sub-Feature)
Track these metrics in the admin dashboard for GST callback team performance:




# E5. GST Filing Reminders & Compliance (Feature)

- Filing deadline reminders: 7 days before, 3 days before, 1 day before deadline
- Late filing penalties: System shows warning if filing after due date (Rs. 50/day late fee for GSTR-3B, Rs. 200/day for GSTR-1)
- ITC mismatch alerts: If supplier's GSTR-1 doesn't match user's GSTR-3B ITC claim  triggers callback
- Annual return reminder: GSTR-9 annual return reminder (for turnover > 2 Crore)
- Proactive callback: If return is not approved 2 days before deadline  automatic callback to user








This module helps business owners apply for loans by automatically packaging their financial documents in a bank-ready format. Instead of spending weeks collecting documents, the user just taps a button — SnapAccount already has everything.


# F1. Loan Categories (Feature)



# F2. Loan Eligibility Check (Feature)

## F2.1 Eligibility Criteria (Sub-Feature)
Before showing loan options, the system checks basic eligibility:
- Business vintage: At least 1 year of operation (checked from profile)
- Minimum turnover: Varies by loan type (checked from financial dashboard)
- GST compliance: All GST returns filed on time (checked from GST module)
- KYC complete: PAN verified, Aadhaar verified
- Financial health: Positive cash flow, no heavy losses


## F2.2 Eligibility Result Screen (Sub-Feature)
- If eligible  Show available loan types with estimated amounts and interest rates
- If not eligible  Show clear reasons (e.g., 'GST returns for 3 months are pending') and steps to become eligible


- If partially eligible  Show which loans are available and what's needed for others



# F3. Auto-Generated Document Package (Feature)

This is the magic feature of the Loan Hub. We auto-generate a professional PDF package containing everything the bank needs:





# F4. Loan Application Workflow (Feature)

## F4.1 Application Steps (Sub-Feature)
- User selects loan type and enters desired amount
- System shows estimated EMI, interest rate, and tenure options
- User reviews the auto-generated document package
- User selects preferred bank(s) from partner list
- Consent screen: User explicitly agrees to share financial data with selected bank(s)
- Document package is submitted to bank via API or email
- Application status is tracked in real-time


## F4.2 Consent Management (Sub-Feature)
- User MUST give explicit consent before any data is shared
- Show exactly what data will be shared: list of documents, financial summary
- Consent is recorded with: timestamp, IP address, device ID, list of banks
- User can revoke consent at any time (data sharing stops, but already shared data remains)


- Consent history is viewable in the app


## F4.3 Application Status Tracking (Sub-Feature)









This module allows salaried employees to file their Income Tax Returns through SnapAccount. The key differentiator is the Human-Touch model: if documents are missing or user is confused, our team CALLS them and guides them personally.


# G1. Employee Onboarding & Profile (Feature)

## G1.1 Employee Registration (Sub-Feature)
- Same OTP-based registration as business owners (Module 1)
- If user already has a SnapAccount business account, ITR is an additional module
- New users can sign up specifically for ITR filing


G1.2 Employee Profile Setup (Sub-Feature)


# G2. ITR Document Collection (Feature)

## G2.1 Document Types for ITR (Sub-Feature)
These are ALL the document types the ITR module supports:


## G2.2 Smart Document Checklist (Sub-Feature)
- System generates a personalized checklist based on the user's profile answers
- Example: If user says 'I pay rent'  Rent Receipts + Landlord PAN are added
- Example: If user says 'I have no investments'  80C/80D documents are marked 'Not Required'
- Progress bar: "4 of 7 documents uploaded | 57% complete"
- Each item shows status: Not Uploaded (grey), Uploaded (blue), Verified (green), Rejected (red)



# G3. Backend Verification System (Feature)

Every uploaded document is verified by a real person in our team:

After checking, team takes action: Approve, Reject (with reason), or Need Clarification (triggers callback).



# G4. Human-Touch Callback System (Feature)




## G4.1 Callback Triggers (Sub-Feature)
- Missing mandatory documents (e.g., Form 16 not uploaded after 3 days)
- Document rejected (blurry, wrong year, wrong document)
- Needs clarification (team has questions about uploaded docs)
- Multiple employers detected (need Form 16 from each employer)
- Complex situation (rental income, capital gains, foreign income)
- User requested (user taps 'Request Callback' button in app)


## G4.2 Callback Workflow Steps (Sub-Feature)
- Callback Created: System creates request with reason and user details
- Assignment: Team Lead assigns to an available Support Executive
- Preparation: Executive reviews user's documents before calling
- The Call: Executive calls with a friendly, professional greeting
- Listen & Understand: Executive listens to the employee's confusion
- Guide & Resolve: Explains what's needed, guides them step by step
- Notes: Records call notes, resolution summary, call duration
- Follow-up: If unresolved, schedules a follow-up callback


## G4.3 Common Callback Scenarios (Sub-Feature)



G4.4 Callback KPIs (Sub-Feature)
- First Call Resolution: > 70% of issues resolved in first call
- Avg Call Duration: 8-12 minutes
- Document Completion Rate: > 95% after callback
- Response Time: < 4 hours from creation to call
- Customer Satisfaction: > 4.5 / 5



# G5. Tax Computation Engine (Feature)

Once all documents are verified, the CA creates the tax computation. This is the core calculation logic.


## G5.1 Income Heads (Sub-Feature)


G5.2 Tax Slab Calculation (Sub-Feature)
Old Tax Regime Slabs (FY 2024-25):



New Tax Regime Slabs (FY 2024-25, Default):


## G5.3 Computation Steps (Sub-Feature)
- Calculate Gross Total Income = All income heads combined
- Subtract Exemptions (HRA, LTA, Standard Deduction)
- Subtract Deductions (80C, 80D, 24b, etc.)
- Apply Tax Slabs  Tax before cess
- Add Surcharge if income > 50 Lakhs
### Add 4% Health & Education Cess
- Apply Section 87A Rebate if eligible
- Subtract TDS Already Paid  Refund Due or Tax Payable


# G6. Regime Comparison & Selection (Feature)

- System calculates tax under BOTH Old and New regimes
- Side-by-side comparison screen showing: Deductions, Taxable Income, Tax, Refund/Payable
- Recommendation: "You save Rs. X by choosing [Old/New] Regime"
- User selects preferred regime  Can change until final approval
- Important: New Regime is the DEFAULT from FY 2023-24 onwards



# G7. ITR Summary, Approval & Filing (Feature)



## G7.1 ITR Summary Screen (Sub-Feature)
- Shows complete summary: Personal details, Income, Exemptions, Deductions, Tax, Refund/Payable
- Two buttons: 'Approve & File' and 'I Have Questions'
- 'I Have Questions'  Triggers a callback
- 'Approve & File'  Records consent (timestamp, IP, device ID)  Team files on IT portal


## G7.2 Filing Process (Sub-Feature)
- Backend team files ITR on incometax.gov.in (manual process by trained team)
- Correct ITR form selected: ITR-1 (simple salary), ITR-2 (capital gains/multiple properties)
- Downloads ITR-V (Acknowledgment) and uploads to user's vault
- Records Acknowledgment Number in the system


G7.3 Filing Statuses (Sub-Feature)


# G8. E-Verification & Post-Filing (Feature)

## G8.1 E-Verification (Sub-Feature)
- Must be done within 30 days of filing (otherwise return is invalid)
- Primary method: Aadhaar OTP — OTP sent to Aadhaar-linked mobile
- Alternative methods: Net Banking, Bank EVC, Digital Signature
- Reminder schedule: Day 1, Day 7, Day 15, Day 25 (callback), Day 29 (urgent)


## G8.2 Refund Tracking (Sub-Feature)
- Visual timeline (like delivery tracking): Processing  Approved  Initiated  Credited
- Show estimated timeline: 'Usually 20-45 days after e-verification'
- If refund fails (wrong bank details)  Guide user to submit Refund Reissue Request


## G8.3 Notice Handling (Sub-Feature)
- Intimation 143(1): Automated processing result from IT Dept (usually not a problem)
- Defective Return 139(9): Something missing; must correct within 15 days (URGENT)
- Scrutiny Notice 143(2): IT Dept wants detailed examination (CA handles)
- Demand Notice 156: IT Dept says you owe more tax (needs response)
- Our CA team handles all notice responses on behalf of the user










This module provides direct communication between users and Chartered Accountants. Users can ask questions about GST, ITR, compliance, or loans and get expert answers.


# H1. Real-Time Chat (Feature)

## H1.1 Chat Interface (Sub-Feature)
- WhatsApp-style chat UI with message bubbles
- Supports: Text messages, Image sharing (for documents), PDF sharing
- Typing indicator: Shows when CA is typing
- Read receipts: User knows when CA has seen their message
- Uses SignalR for real-time message delivery (WebSocket)


## H1.2 Query Categories (Sub-Feature)
When starting a chat, user selects a category to route to the right expert:


## H1.3 Chat History & Search (Sub-Feature)
- All past conversations are saved and searchable
- User can search by keyword across all chats
- Bookmark important answers for quick reference
- Export chat as PDF for records



# H2. Appointment Booking (Feature)



## H2.1 Video Call Consultation (Sub-Feature)
- For complex queries that need face-to-face discussion
- User selects a time slot from available CA schedule
- Calendar integration: Add to Google Calendar / Apple Calendar
- Reminder: 30 min before + 5 min before the call
- Video call via built-in video feature or integration with Google Meet / Zoom


## H2.2 Appointment Management (Sub-Feature)
- View upcoming and past appointments
- Reschedule or cancel (minimum 2 hours before)
- Post-call: CA writes summary notes visible to the user
- Rating: User rates the consultation (1-5 stars)










A robust notification system keeps users informed at every step across ALL modules. Communication happens through multiple channels.


# I1. Notification Channels (Feature)



# I2. Notification Events by Module (Feature)














The Admin Panel is a web application (React.js) used by the entire backend team. It's the command center for all operations across all modules.


# J1. Admin Dashboard (Feature)

The admin home screen shows key metrics at a glance:
- Documents Pending Processing: Total across all users
- GST Returns Pending Filing: Approved but not yet filed
- ITR Verifications Pending: Documents waiting for review
- Pending Callbacks: Callback requests not yet made
- Loan Applications Active: In-progress applications
- Chat Queries Unanswered: Messages waiting for CA response
- Today's Activity Summary: Documents processed, ITRs filed, calls made
- Team Workload: Tasks per team member (for load balancing)



# J2. Document Processing Panel (Feature)

- Queue view with filters: Status, Category, Date, Priority, Assigned To
- Split-screen view: Document image/PDF on LEFT, data entry form on RIGHT
- OCR data pre-filled; team corrects and confirms
- Quick action buttons: Approve, Reject (with reason dropdown), Need Clarification
- Bulk assign: Manager assigns batches of documents to team members
- SLA tracking: Time since upload, overdue alerts



# J3. GST Filing Panel (Feature)

- List of users with pending/approved GST returns by filing period
- View return details: Sales summary, Purchase summary, ITC, Net payable
- After filing on GST portal: Enter ARN number, mark as filed
- ITC mismatch tracking: Flag discrepancies between purchase claims and supplier filings
- GST Callback Queue: Pending callbacks for missing bills, rate issues, ITC mismatches (same UI as ITR callbacks)
- GST notice tracker: Open GST notices with response deadlines



# J4. ITR Operations Panel (Feature)



- Verification Queue: Documents waiting for review (same as J2 but ITR-specific)
- Callback Management: List of pending/scheduled/completed callbacks
- Tax Computation Panel: CA edits income, exemptions, deductions; auto-calculates tax
- Filing Queue: User-approved ITRs ready to be filed on IT portal
- Notice Tracker: Open IT notices with response deadlines



# J5. Loan Operations Panel (Feature)

- Active loan applications with status tracking
- Document package review before submission to bank
- Bank communication log
- Disbursement tracking



# J6. Role-Based Access Control (Feature)








K1. Business Owner Journey (Accounting + GST)

This is the primary journey — how a business owner goes from downloading the app to getting their GST return filed:




# K2. Employee ITR Filing Journey










If you're new to Indian finance/taxation, here are the terms you'll encounter while building SnapAccount. Understanding these helps you name variables, write conditions, and design screens correctly.




End of Document. For database schemas, API endpoint documentation, and system architecture details, please refer to the separate technical specification documents.

Document Version 2.0 | February 2026 | SnapAccount Development Team
| Detail | Value |
| --- | --- |
| Project Name | SnapAccount — SME Financial Solution App |
| Document Type | Complete Feature Breakdown (All Modules) |
| Version | 2.0 |
| Last Updated | February 2026 |
| Target Audience | Junior to Mid-Level Developers |
| Total Modules | 7 (Onboarding, Document Vault, Dashboard, GST, Loans, ITR, Expert Chat) |
| What User Does | What SnapAccount Delivers |
| --- | --- |
| Takes a photo of a sales bill | Automatic accounting entry + updated financial dashboard |
| Takes a photo of a purchase bill | Expense tracked, Input Tax Credit calculated |
| Uploads bank statement | Cash flow analysis, interest income captured |
| Taps 'File GST' | Auto-calculated GSTR-3B, one-tap filing after approval |
| Taps 'Apply for Loan' | Auto-generated financial package sent to partner banks |
| Uploads Form 16 | Complete ITR filing with human verification & callback support |
| Asks a question in chat | Direct response from a Chartered Accountant |
| Role | Platform | What They Do |
| --- | --- | --- |
| Business Owner (SME) | Mobile App | Takes photos of bills, views dashboard, approves GST returns, applies for loans. This is the PRIMARY user. |
| Employee (Salaried) | Mobile App | Uploads tax documents (Form 16, investment proofs) for ITR filing. Uses the ITR module only. |
| Backend	Data Entry Operator | Admin Panel (Web) | Verifies OCR data, makes accounting entries, processes documents. First line of processing. |
| Backend Support Executive | Admin Panel (Web) | Calls users when documents are missing/wrong. Provides human-touch support. Files GST/ITR. |
| Chartered Accountant (CA) | Admin Panel (Web) | Reviews financial statements, creates tax computations, handles complex queries, responds to IT/GST notices, provides expert chat consultation. |
| Operations Manager | Admin Panel (Web) | Manages the team, monitors KPIs, views reports, handles escalations. |
| Layer | Components | Components | Components | Components | Components | Technologies |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend Layer | Mobile App (iOS + Android), Admin Panel (Web), Expert Portal (Web) | Mobile App (iOS + Android), Admin Panel (Web), Expert Portal (Web) | Mobile App (iOS + Android), Admin Panel (Web), Expert Portal (Web) | Mobile App (iOS + Android), Admin Panel (Web), Expert Portal (Web) | Mobile App (iOS + Android), Admin Panel (Web), Expert Portal (Web) | React Native, React.js + TypeScript, Redux Toolkit |
| API Gateway | Single entry point for all API calls. Handles authentication, rate limiting, routing. | Single entry point for all API calls. Handles authentication, rate limiting, routing. | Single entry point for all API calls. Handles authentication, rate limiting, routing. | Single entry point for all API calls. Handles authentication, rate limiting, routing. | Single entry point for all API calls. Handles authentication, rate limiting, routing. | AWS API Gateway or Kong |
| Backend Services | Auth Service, Document Service, Accounting Service, GST Service, Loan Service, ITR Service, Chat Service, Notification Service, Report Service | Auth Service, Document Service, Accounting Service, GST Service, Loan Service, ITR Service, Chat Service, Notification Service, Report Service | Auth Service, Document Service, Accounting Service, GST Service, Loan Service, ITR Service, Chat Service, Notification Service, Report Service | Auth Service, Document Service, Accounting Service, GST Service, Loan Service, ITR Service, Chat Service, Notification Service, Report Service | Auth Service, Document Service, Accounting Service, GST Service, Loan Service, ITR Service, Chat Service, Notification Service, Report Service | .NET 8 Web API, Entity Framework Core, SignalR, Hangfire |
| Data & Storage | Primary Database, Document Storage, Cache, Search Engine | Primary Database, Document Storage, Cache, Search Engine | Primary Database, Document Storage, Cache, Search Engine | Primary Database, Document Storage, Cache, Search Engine | Primary Database, Document Storage, Cache, Search Engine | PostgreSQL, Azure Blob / S3, Redis, Elasticsearch |
| External Integrations | OCR, GST Portal, Income Tax Portal | Bank | APIs, | SMS | Gateway, | Azure AI, GSTN APIs, Partner Bank APIs, Twilio / MSG91 |
| Area | Technology | Why We Chose It |
| --- | --- | --- |
| Mobile App | React Native | Single codebase for both iOS and Android. Large community, fast development. |
| Admin Panel | React.js + TypeScript | Type safety reduces bugs. Rich component ecosystem. |
| UI
Components | NativeBase (mobile) / Tailwind CSS (web) | Pre-built, clean components. Fast to style. |
| State Management | Redux Toolkit | Predictable state, easy debugging, works on both mobile and web. |
| Backend API | .NET 8 Web API | Enterprise-grade, high performance, strong type system with C#. |
| ORM | Entity Framework Core | Automatic migrations, LINQ queries, less SQL boilerplate. |
| Real-time | SignalR | WebSocket-based. Used for chat and live notifications in admin panel. |
| Background Jobs | Hangfire | Scheduled tasks (e.g., daily reports, deadline reminders). Built-in retry. |
| Authentication | JWT + OAuth 2.0 | Stateless, secure. Access token + refresh token pattern. |
| Primary Database | PostgreSQL | Free, powerful, excellent JSON support for OCR data. |
| Document Storage | Azure Blob Storage / AWS S3 | Unlimited scalable file storage with CDN. |
| Cache | Redis | In-memory cache for sessions, frequently accessed data, and rate limiting. |
| Search | Elasticsearch | Fast full-text search across documents and ledger entries. |
| OCR | Azure AI Document Intelligence | Best accuracy for Indian documents (Hindi + English mixed text). |
| SMS | Twilio / MSG91 | Reliable OTP delivery and transactional SMS. |
| Email | SendGrid / AWS SES | Transactional emails (ITR-V, reports, notifications). |
| CI/CD | GitHub	Actions	+	Azure DevOps | Automated build, test, and deployment pipelines. |
| Monitoring | Application	Insights	+ Prometheus | Real-time performance monitoring and alerting. |
| Area | Technology | Why We Chose It |
| --- | --- | --- |
| Logging | Serilog + ELK Stack | Structured logging. Elasticsearch + Logstash + Kibana for analysis. |
| Field | Require d? | Validation | Why We Need It |
| --- | --- | --- | --- |
| Business Name | Yes | Min 2 characters | Displayed on dashboard, used in GST filing |
| Owner Name | Yes | As per PAN | Legal name for all filings |
| Business Type | Yes | Dropdown:	Proprietorship, Partnership, LLP, Pvt Ltd, etc. | Determines GST form type and ITR form type |
| Business Category | Yes | Dropdown:	Retail,	Manufacturing, Services, Restaurant, etc. | Helps categorize expenses and customize dashboard |
| PAN Number | Yes | Regex: XXXXX9999X format | Mandatory for GST and ITR. Verified via API. |
| GSTIN | Optional | 15-character format | Only if GST registered. Links to GST portal. |
| Annual Turnover (approx) | Yes | Dropdown:	Under	20L,	20L-40L, 40L-1Cr, 1Cr-5Cr, 5Cr+ | Determines	GST	scheme,	audit requirements |
| Business Address | Yes | Full address with PIN code | Shown on invoices, required for GST |
| Business Start Date | Yes | Date picker | For financial statement preparation |
| Bank Account Number | Yes | Numeric, 9-18 digits | For loan applications and refund processing |
| IFSC Code | Yes | 11-character format (4 letters + 0 + 6 alphanumeric) | To identify the bank branch |
| Category | Icon Suggestion | When to Use (shown as helper text to user) |
| --- | --- | --- |
| Sales Bill | Green	up arrow | Bill you gave TO a customer for goods/services you sold |
| Purchase Bill | Red	down arrow | Bill you received FROM a supplier for goods/services you bought |
| Expense Receipt | Orange receipt | Day-to-day business expenses: rent, electricity, travel, stationery |
| Category | Icon Suggestion | When to Use (shown as helper text to user) |
| --- | --- | --- |
| Bank Statement | Blue	bank icon | Monthly bank statement (PDF or photo of passbook page) |
| Salary Slip | Purple person | If you pay employees, upload their salary slips |
| Other | Grey document | Anything that doesn't fit above categories |
| Field | Extracted From | Confidence Expected |
| --- | --- | --- |
| Total Amount | Bill total / Grand Total line | High (90%+) |
| Date | Invoice date / Bill date | High (85%+) |
| Party Name | Customer/Vendor name on bill | Medium (70%+) |
| GST Number | GSTIN printed on the bill | High (90%+ if printed clearly) |
| Invoice Number | Bill number / Invoice number | Medium (75%+) |
| Individual	Line Items | Each product/service listed | Low-Medium (60%+) |
| GST	Rate	& Amount | CGST, SGST, IGST breakup | Medium (75%+) |
| Status | Meaning | User Sees |
| --- | --- | --- |
| UPLOADED | File received, waiting in queue for processing | "Processing..." with spinner |
| OCR_COMPL ETE | OCR has extracted data, waiting for human review | "Processing..." (same) |
| IN_REVIEW | Backend team member is reviewing this document | "Being reviewed" |
| PROCESSED | Data verified and accounting entry created | Green checkmark ✓ |
| REJECTED | Document is unreadable, wrong category, or duplicate | Red cross with reason |
| Card | What It Shows | Color | Update Frequency |
| --- | --- | --- | --- |
| Total Sales (This Month) | Sum of all Sales bills processed this month | Green | Real-time	(after processing) |
| Total	Expenses (This Month) | Sum of all Purchase + Expense bills this month | Red | Real-time |
| Net Profit / Loss | Sales minus Expenses (simplified) | Green if profit, Red if loss | Real-time |
| GST Payable (This Month) | Estimated GST the user needs to pay | Orange | Real-time |
| Report | What It Shows (Simple Explanation) | Update Frequency | Who Needs It |
| --- | --- | --- | --- |
| Trial Balance | A summary of all accounts showing total debits and credits. Think of it as a 'snapshot' of where all the money went. | Real-time	(after processing) | CA, Bank for loans |
| Profit & Loss (P&L;) | Shows total income vs total expenses for a period. The bottom line tells you: Did the business make money or lose money? | Daily | Business owner, Bank, CA |
| Balance Sheet | Shows what the business OWNS (assets) vs what it OWES (liabilities). Like a personal net worth statement but for the business. | Monthly | Bank for loans, CA |
| Cash	Flow Statement | Shows money coming IN vs money going OUT. Different from P&L; because it tracks actual cash movement, not just bills. | Weekly | Business owner, Bank |
| Tax Liability Report | How much GST/income tax the business needs to pay. Broken down by CGST, SGST, IGST. | Real-time | Business owner, CA |
| Ledger (Acc ount-wise) | Detailed list of every transaction for a specific account head (e.g., all 'Electricity Expenses' entries). | Real-time | CA, Auditor |
| Field | Calculated From | Simple Explanation |
| --- | --- | --- |
| Total	Taxable Sales | Sum of all Sales bills (excluding exempt sales) | Total value of goods/services you sold that have GST |
| Exempt Sales | Sales bills marked as exempt / nil-rated | Sales where GST doesn't apply (e.g., basic food items) |
| Total	Taxable Purchases | Sum of all Purchase bills with GST | Total value of goods/services you bought that had GST |
| Input Tax Credit (ITC) | GST amount on purchase bills | GST you already paid while buying. You get credit for this. |
| Output	Tax (CGST) | GST collected on sales (Central share) | Half of the GST you collected goes to Central government |
| Output	Tax (SGST) | GST collected on sales (State share) | Half goes to State government (for within-state sales) |
| Output	Tax (IGST) | GST on inter-state sales | Full GST goes to Central govt (for sales to other states) |
| Net Tax Payable | Output Tax minus Input Tax Credit | What you actually need to pay. If ITC > Output, you get a refund. |
| GST Rate | Applied To (Examples) |
| --- | --- |
| 0% (Exempt) | Fresh vegetables, fruits, milk, education services |
| 5% | Packaged food items, economy hotel rooms, transport |
| 12% | Processed food, business class air tickets, medicines |
| 18% | Most services, restaurant food (non-AC), electronics, IT services |
| 28% | Luxury items, automobiles, aerated drinks, cement, ACs |
| Status | Meaning |
| --- | --- |
| DRAFT | System has auto-calculated the return, but it's not finalized yet. Backend team may still be processing some bills. |
| PENDING_APPROVA L | All bills processed. Return is ready for user to review and approve. |
| APPROVED | User has approved. Backend team will file it on the GST portal. |
| FILED | Successfully filed. ARN number received from GST portal. |
| REVISION_NEEDED | Mistake found after filing. Needs amendment in next return. |
| Scenario | Business Owner's Problem | How Our Team Resolves It |
| --- | --- | --- |
| Missing Purchase Bills | "I bought goods from a supplier but didn't get a proper bill" | Explain that without a GST bill, ITC cannot be claimed. Guide user to request a proper tax invoice from supplier. If supplier is unregistered, explain reverse charge mechanism. |
| Wrong	Tax Rate | "I don't know if my product is 12% or 18% GST" | Look up HSN code for the product. Confirm correct rate. If edge case, escalate to CA. Update the bill entry with correct rate. |
| ITC
Mismatch | "Why is my ITC showing less than what I paid?" | Explain GSTR-2A/2B matching: supplier must file their GSTR-1 for your ITC to be confirmed. Show which suppliers haven't filed. Advise user to follow up with those suppliers. |
| Inter-State vs
Intra-State Confusion | "I sold to someone in another state, should I charge IGST or CGST+SGST?" | Explain: Same state = CGST + SGST. Different state = IGST. Check the bill and correct if wrong. Help user understand using billing address vs shipping address. |
| First-Time Filing Anxiety | "This is my first time filing GST, I'm worried I'll make a mistake" | Walk through the entire return step by step. Explain each number. Reassure that our CA reviews everything before filing. Offer to stay on call while user reviews. |
| Credit Note Confusion | "A customer returned goods, how do I handle this in GST?" | Guide user to create a Credit Note in the app. Explain it reduces output tax and sales figures. Show where to upload the credit note document. |
| GST Notice Received | "I got a notice from GST department, what do I do?" | Don't panic! Upload the notice. Escalate to CA immediately. CA reviews and prepares response. Most notices are for small discrepancies and easily resolved. |
| Nil	Return Confusion | "I had no sales this month, do I still need to file?" | Yes! Explain that nil returns are mandatory every month. If not filed, late fee of Rs. 20/day applies. Offer to file the nil return for them immediately. |
| Scenario | Business Owner's Problem | How Our Team Resolves It |
| --- | --- | --- |
| Payment Gateway Issue | "I approved the return but don't know how to pay the tax online" | Walk through GST portal payment process: Login  Create Challan  Select bank  Pay. Or guide to use net banking / UPI for payment. |
| Status | Meaning |
| --- | --- |
| PENDING | Callback created, not yet assigned to anyone |
| SCHEDULED | Assigned to an executive with a scheduled call time |
| IN_PROGRESS | Executive is currently on the call with the business owner |
| COMPLETED | Issue resolved. Resolution summary recorded. |
| FOLLOW_UP_NEED ED | Partially resolved; another call scheduled (e.g., waiting for user to upload missing bill) |
| ESCALATED_TO_CA | Complex GST issue sent to Chartered Accountant for handling |
| CANCELLED | User resolved the issue themselves before the call |
| Metric | Target | Why It Matters |
| --- | --- | --- |
| First Call Resolution Rate | > 75% | Most GST issues are simpler than ITR — missing bills, rate confusion. Should resolve faster. |
| Average	Call Duration | 5-10
minutes | GST calls are usually shorter than ITR calls since the questions are more specific. |
| Return Completion Rate | > 98% | After callback, nearly all users should have their return ready for filing. |
| Callback Response Time | < 4 hours | Fast response prevents users from missing filing deadlines. |
| Customer Satisfaction | > 4.5 / 5 | Post-call rating. Happy users stay with SnapAccount and refer others. |
| Deadline	Filing Rate | > 99% | % of returns filed before the deadline. Callbacks should prevent any last-minute misses. |
| Loan Type | Purpose | Typical Amount | Who Applies |
| --- | --- | --- | --- |
| Business Loan | Expand the business: new equipment, new shop, more inventory | Rs. 1 Lakh – 50 Lakhs | Any business owner |
| Working Capital Loan | Day-to-day operations: pay suppliers, salaries, rent while waiting for customer payments | Rs. 50K – 25 Lakhs | Businesses with cash flow gaps |
| Personal Loan | Owner's personal needs (often used for business indirectly) | Rs. 50K – 10 Lakhs | Any individual |
| MSME/Mudra Loan | Government-backed loans for micro, small, and medium enterprises | Rs. 10K – 10 Lakhs | Eligible MSMEs |
| Document | Source | Format |
| --- | --- | --- |
| Last	12	Months	GSTR-3B Returns | Generated from GST module | PDF with monthly breakdown |
| Balance Sheet | Generated from Financial Dashboard | Professional	PDF	with	CA certification |
| Profit & Loss Statement | Generated from Financial Dashboard | Professional PDF |
| Bank Statement Summary | From uploaded bank statements | Summary PDF |
| Business Registration Proof | From profile (GSTIN certificate) | Copy of original |
| KYC Documents | From profile (PAN, Aadhaar) | Verified copies |
| ITR	Acknowledgments	(if available) | From ITR module | Last 2-3 years ITR-V |
| Status | Meaning |
| --- | --- |
| INITIATED | User started the application but hasn't submitted yet |
| DOCUMENTS_READY | Document package generated, consent pending |
| SUBMITTED | Application and documents sent to bank |
| UNDER_REVIEW | Bank is reviewing the application |
| ADDITIONAL_DOCS_NE EDED | Bank needs more documents (user is notified) |
| APPROVED | Loan approved! Disbursement pending. |
| DISBURSED | Money credited to user's account |
| REJECTED | Application rejected. Reason shown to user. |
| Field | Required? | Why We Need It |
| --- | --- | --- |
| Full	Name	(as	on PAN) | Yes | Must match Income Tax portal records exactly |
| PAN Number | Yes | Unique tax ID. All filing happens against PAN. |
| Date of Birth | Yes | Senior citizens (60+) have different tax slabs |
| Email Address | Yes | IT portal sends confirmations to email |
| Aadhaar Number | Yes | Mandatory for e-verification of ITR |
| Employer Name | Yes | Shows on the ITR form |
| Employer TAN | Optional | Available on Form 16. Helps in verification. |
| Employment Type | Yes | Full-Time / Contract / Part-Time |
| Financial Year | Yes | Which year's ITR (e.g., 2025-26) |
| Bank	Account	(for refund) | Yes | Refund is credited here |
| IFSC Code | Yes | Required for refund processing |
| Residential Address | Yes | Required field on ITR form |
| Categor y | Document | Simple Explanation | Priority |
| --- | --- | --- | --- |
| Salary | Form	16	(Part A+B) | THE most important document. Employer gives it annually. Shows salary breakup and TDS deducted. | Mandatory |
| Salary | Form 16A | TDS certificate for non-salary income (bank FD interest, etc.). Bank issues this. | If Applicable |
| Verificati on | Form 26AS / AIS | Your tax passbook. Shows ALL TDS deducted against your PAN. Download from IT portal. | Mandatory |
| 80C Ded uctions | PPF / LIC / ELSS
/ Tuition Fee / Home	Loan Principal receipts | Investment proofs for tax saving. Max 1.5 Lakhs combined deduction. | Optional |
| 80D Ded uctions | Health Insurance Premium Receipt | Mediclaim premium. 25K for self, 25K/50K for parents. | Optional |
| HRA | Rent Receipts + Landlord PAN | If paying rent, submit monthly receipts. Landlord PAN needed if rent > 1 Lakh/year. | If Claiming HRA |
| Home Loan | Home	Loan
Interest	+
Principal Certificate | Certificate from bank. Interest deductible under 24(b), Principal under 80C. | If Applicable |
| Other Income | Bank Statements
/	FD	Interest Certificate | For declaring interest income. Needed if total interest > 10,000/year. | If > 10K Interest |
| Capital Gains | Stock/MF Capital Gains Statement | Profit/loss from selling shares or mutual funds during the year. | If Applicable |
| NPS | NPS Contribution Statement | National Pension System. Additional 50K deduction under 80CCD(1B). | Optional |
| Donation s | 80G	Donation Receipts | Receipts for donations to eligible charities (50% or 100% deductible). | Optional |
| Check | What They Verify |
| --- | --- |
| PAN Match | Does the PAN on the document match the user's registered PAN? |
| Name Match | Does the name on the document match the profile name? |
| Financial Year | Is the document for the correct financial year? |
| Completeness | Are all pages uploaded? (Form 16 has multiple pages) |
| Readability | Is the document clear enough to read? |
| Amounts Cross-Check | Do amounts on Form 16 match Form 26AS TDS entries? |
| Scenario | Employee's Problem | Our Team's Resolution |
| --- | --- | --- |
| Missing Form 16A | "My bank didn't give me Form 16A" | Guide to download Form 26AS which has all TDS details |
| 80C
Confusion | "I don't know which documents count for 80C" | Explain: PPF, LIC, ELSS, Tuition Fees, Home Loan Principal, EPF |
| Job Change | "I changed jobs mid-year" | Ask for Form 16 from BOTH employers; system combines them |
| HRA Issue | "My landlord won't give PAN" | If rent < 1 Lakh/year, PAN not needed. If > 1 Lakh, guide alternatives |
| Can't Download 26AS | "I don't know how to get Form 26AS" | Walk through step-by-step: incometax.gov.in login process |
| Income Head | What It Includes | Source |
| --- | --- | --- |
| Salary Income | Basic + DA + HRA + Special Allowances + Bonus | Form 16 Part B |
| House Property | Rental income minus 30% deduction minus home loan interest | User input + Loan Certificate |
| Capital Gains | Profit	from	stocks/mutual	funds/property (short-term + long-term) | Broker statement |
| Other Sources | FD interest, savings interest, dividends | Bank statement + Form 16A |
| Income Range | Tax Rate |
| --- | --- |
| Up to 2,50,000 | 0% |
| Income Range | Tax Rate |
| --- | --- |
| 2,50,001 – 5,00,000 | 5% |
| 5,00,001 – 10,00,000 | 20% |
| Above 10,00,000 | 30% |
| Income Range | Tax Rate |
| --- | --- |
| Up to 3,00,000 | 0% |
| 3,00,001 – 7,00,000 | 5% |
| 7,00,001 – 10,00,000 | 10% |
| 10,00,001 – 12,00,000 | 15% |
| 12,00,001 – 15,00,000 | 20% |
| Above 15,00,000 | 30% |
| Status | Meaning |
| --- | --- |
| DRAFT | Tax computation created, not yet sent to user |
| PENDING_APPROVA L | Summary sent to user, waiting for approval |
| USER_APPROVED | User approved, team will file |
| FILING_IN_PROGRE SS | Team is filing on the portal right now |
| FILED | Filed successfully! Acknowledgment received. |
| E_VERIFIED | User completed e-verification |
| COMPLETED | Entire process done |
| Category | Example Questions | Routed To |
| --- | --- | --- |
| GST Queries | "What rate applies to my product?", "How to claim ITC?" | CA with GST specialization |
| ITR / Income Tax | "Should I choose Old or New regime?", "Is my FD interest taxable?" | CA with ITR specialization |
| Compliance | "Is my business required to get audited?", "What are TDS obligations?" | Senior CA |
| Loans	&
Finance | "How to improve my credit score?", "Which loan is best for me?" | Financial Advisor / CA |
| General | Any other business-related question | Next available CA |
| Channel | Used For | Technology |
| --- | --- | --- |
| Push Notification | Instant alerts: doc verified, ITR ready, refund credited, GST deadline | Firebase Cloud Messaging (FCM) |
| SMS | OTP, critical reminders, filing confirmation | Twilio / MSG91 |
| Email | Detailed summaries, report PDFs, ITR-V copies, notice alerts | SendGrid / AWS SES |
| In-App Messages | Non-urgent updates, tips, educational content | Custom message center |
| WhatsApp (Future) | Conversational updates, document sharing | WhatsApp Business API |
| Module | Event | Push | SMS | Email |
| --- | --- | --- | --- | --- |
| Onboarding | Account created / OTP | Yes | Yes | Yes |
| Document Vault | Document uploaded | — | — | — |
| Document Vault | Document processed / rejected | Yes | — | Yes |
| Dashboard | Monthly report ready | Yes | — | Yes |
| GST | Return ready for approval | Yes | Yes | Yes |
| GST | Return filed (ARN received) | Yes | Yes | Yes |
| GST | Filing deadline reminder (7d, 3d, 1d before) | Yes | Yes | Yes |
| GST | Callback scheduled (missing bills/ITC issue) | Yes | Yes | — |
| GST | GST notice received | Yes | Yes | Yes |
| Loan | Application submitted / status change | Yes | — | Yes |
| Module | Event | Push | SMS | Email |
| --- | --- | --- | --- | --- |
| Loan | Loan approved / disbursed | Yes | Yes | Yes |
| ITR | Document verified / rejected | Yes | — | Yes |
| ITR | Callback scheduled | Yes | Yes | — |
| ITR | Tax computation ready / ITR ready for approval | Yes | Yes | Yes |
| ITR | ITR filed / E-verification reminder | Yes | Yes | Yes |
| ITR | Refund status update / credited | Yes | Yes | Yes |
| ITR | IT Notice received | Yes | Yes | Yes |
| Chat | New message from CA | Yes | — | — |
| Chat | Appointment reminder | Yes | Yes | — |
| Feature | Data	Entry Operator | Support Executive | CA | Ops Manager |
| --- | --- | --- | --- | --- |
| Process documents | Yes | Yes | Yes | — |
| Verify ITR documents | — | Yes | Yes | — |
| Make callbacks | — | Yes | Yes | — |
| Create/edit	tax computation | — | — | Yes | — |
| File GST/ITR on portal | — | Yes (after CA OK) | Yes | — |
| Handle	IT/GST notices | — | — | Yes | — |
| Answer expert chat | — | — | Yes | — |
| View reports/analytics | Limited | Limited | Yes | Full |
| Manage team | — | — | — | Yes |
| St e p | User Action | System Action | Module |
| --- | --- | --- | --- |
| 1 | Downloads	app,	enters mobile number | Sends OTP | Onboarding |
| 2 | Verifies OTP, fills business profile | Creates account, verifies PAN/GSTIN | Onboarding |
| 3 | Customer buys goods; user takes photo of the sales bill | Stores	file,	runs	OCR,	queues	for processing | Doc Vault |
| 4 | User uploads a purchase bill from supplier | Same flow: store, OCR, queue | Doc Vault |
| 5 | Uploads expense receipts (rent, electricity) | Categorized as expenses | Doc Vault |
| 6 | (Backend) Team verifies OCR, makes accounting entries | Ledger updated, Trial Balance recalculated | Doc Vault |
| 7 | User opens dashboard, sees Sales, Expenses, Profit | Real-time data from processed entries | Dashboard |
| 8 | Month-end: User gets notification 'GST return ready' | Auto-calculated from all processed bills | GST |
| 9 | User reviews the GSTR-3B summary | Shows taxable sales, ITC, net tax payable | GST |
| 10 | User taps 'Approve & File' | Records approval; team files on GST portal | GST |
| 11 | User gets ARN number confirmation | Return filed, status updated | GST |
| 12 | User wants a loan; checks eligibility | System checks financials, GST compliance | Loan Hub |
| 13 | User taps 'Apply'; document package auto-generated | 12-month GSTR-3B + Balance Sheet + P&L; packaged | Loan Hub |
| 14 | User	gives	consent; application sent to bank | Consent recorded; documents submitted | Loan Hub |
| St e p | User Action | System Action | Module |
| --- | --- | --- | --- |
| 15 | User tracks loan status in app | Status updates from bank reflected | Loan Hub |
| St e p | User Action | System Action | Module |
| --- | --- | --- | --- |
| 1 | Signs up and selects 'ITR Filing' | Shows ITR profile wizard | Onboarding |
| 2 | Fills PAN, employer details, bank account | Verifies PAN, checks Aadhaar linking | ITR |
| 3 | Sees	personalized document checklist | Generated based on profile answers | ITR |
| 4 | Uploads	Form	16, investment proofs, etc. | Stores, runs OCR, queues for verification | ITR |
| 5 | Gets	notification: documents verified (or rejected) | Backend team reviews each document | ITR |
| 6 | (If docs missing) Gets a CALL from support team | Callback triggered; team guides user | ITR |
| 7 | Uploads missing documents after call | Re-enters verification queue | ITR |
| 8 | Gets	notification:	'Tax computation ready' | CA creates computation after all docs verified | ITR |
| 9 | Views Old vs New regime comparison | Both calculated, recommendation shown | ITR |
| 10 | Selects regime, reviews ITR summary | Full summary with all details displayed | ITR |
| 11 | Taps 'Approve & File' | Consent recorded; team files on IT portal | ITR |
| 12 | Gets	ITR-V
acknowledgment | Acknowledgment number + PDF shared | ITR |
| 13 | E-verifies with Aadhaar OTP | OTP submitted to IT portal | ITR |
| 14 | Tracks refund status | Visual timeline; periodic updates | ITR |
| 15 | Refund credited to bank! | Celebration screen in app | ITR |
| Term | Full Form | Simple Explanation |
| --- | --- | --- |
| PAN | Permanent	Account Number | 10-character tax ID (e.g., ABCDE1234F). Every taxpayer has one. |
| GSTIN | GST	Identification Number | 15-character number for GST-registered businesses. Format: State code + PAN + check digit. |
| TAN | Tax Deduction Account Number | ID of entity that deducts tax (employer/bank). |
| TDS | Tax Deducted at Source | Tax your employer/bank already cut and paid to government. Pre-paid tax. |
| ITR | Income Tax Return | Annual tax form declaring income and tax. Filed once a year. |
| ITR-V | ITR Verification Form | Acknowledgment PDF generated after filing. Proof of submission. |
| FY | Financial Year | Year income is earned (April 1 to March 31). E.g., FY 2025-26. |
| AY | Assessment Year | Year tax is assessed. Always FY + 1. E.g., FY 2025-26 = AY 2026-27. |
| GST | Goods & Services Tax | India's indirect tax on sale of goods/services. Rates: 0%, 5%, 12%, 18%, 28%. |
| GSTR-1 | GST Return 1 | Monthly/quarterly return listing all sales invoices. |
| GSTR-3B | GST Return 3B | Monthly summary return showing total sales, purchases, and net tax payable. |
| CGST | Central GST | Half of GST goes to Central government (for within-state sales). |
| SGST | State GST | Half goes to State government (for within-state sales). |
| IGST | Integrated GST | Full GST for inter-state sales. Goes to Central government. |
| ITC | Input Tax Credit | GST paid on purchases. You get credit for this against GST collected on sales. |
| ARN | Acknowledgment Reference Number | Confirmation number received after filing GST return. |
| HSN | Harmonized System of Nomenclature | Code for classifying goods for GST. Every product has an HSN code. |
| SAC | Services	Accounting Code | Code for classifying services for GST. Every service has a SAC code. |
| Form 16 | TDS Certificate | Employer gives this. Shows salary breakup and TDS deducted. |
| Form 26AS | Annual Tax Statement | Shows ALL TDS deducted against your PAN from all sources. |
| Term | Full Form | Simple Explanation |
| --- | --- | --- |
| AIS | Annual	Information Statement | Newer version of 26AS with investment and transaction info. |
| Section 80C | Income Tax Act Section 80C | Deduction for investments (PPF, LIC, ELSS, etc.). Max: Rs. 1.5 Lakhs. |
| HRA | House Rent Allowance | Part of salary for rent. Partially exempt if you actually pay rent. |
| EVC | Electronic	Verification Code | Code for e-verifying ITR via Aadhaar/Net Banking. |
| JWT | JSON Web Token | Token used for API authentication. Contains user info, expires after set time. |
| OCR | Optical	Character Recognition | Technology that reads text from images/photos. |
| OTP | One-Time Password | 6-digit code sent via SMS for verification. Expires in 5 minutes. |
| SignalR | Microsoft SignalR | Library for real-time web communication (WebSocket). Used for chat and live updates. |
| Hangfire | Hangfire	Background Jobs | .NET library for scheduled/background tasks. Used for reminders, report generation. |