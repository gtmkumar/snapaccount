# SnapAccount User Hierarchy

> **Status (2026-06-06):** Reconciled with the implementation. See
> `docs/design/user-hierarchy-gap-analysis.md` for the full gap analysis and the
> Phase 1 changes (persona fork, conditional mobile navigation, `UserType` plumbing).
> Persona is stored on `auth.user_profile.user_type` (`BUSINESS_OWNER | EMPLOYEE | STAFF`).

## User Types

### 1. Business Owner — `BUSINESS_OWNER` (Mobile APP)

A SME owner who runs a business and owns an `Organization`.

- Document Vault
- Accounting
- Financial Dashboard
- GST Filing
- Loan Hub
- Expert Chat / CA

### 2. Salaried Individual — `EMPLOYEE` (Mobile APP)

A **standalone individual taxpayer** who files their own ITR. Has **no organization**.
(Distinct from an SME's staff member — that "employee of an org" is a separate
`ORG_MEMBER` concept, planned for Phase 2; see the gap analysis.)

- Personal Tax Profile (PAN + DOB)
- Form 16 Upload
- Tax Documents Upload
- ITR Filing
- Callback / Expert Support

### 3. Backend Staff (Admin Panel Users) — platform roles, NOT a mobile `UserType`

Staff are identified by an assigned platform **role**, not by `user_type`. Seeded roles:

- Data Entry Operator (`DATA_ENTRY_OPERATOR`) — document OCR queue
- Support Executive (`SUPPORT_EXECUTIVE`) — callbacks + chat
- Chartered Accountant (`CA`) — ITR computation, GST/ITR review
- Operations Manager (`OPERATIONS_MANAGER`) — team, KPIs, bank comms
- Super Administrator (`SUPER_ADMIN`) — full platform access
- Partner Bank Representative (`PARTNER_BANK_REP`) — read-only loan visibility

Org-scoped roles assignable to customer org members (Phase 2): `ORG_ADMIN`, `MANAGER`, `HR`, `REVIEWER`.

---

# Organizational Diagram

```text
                                   SNAPACCOUNT
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
        ▼                               ▼                               ▼

┌────Mobile APP────────┐   ┌─────Mobile APP───────┐   ┌─────────Web Admin───────┐
│ Business Owner       │   │ Employee             │   │ Backend Staff           │
│ (SME Organization)   │   │ (Salaried User)      │   │ (Admin Panel Users)     │
└──────────────────────┘   └──────────────────────┘   └─────────────────────────┘
        │                               │                               │
        │                               │                               ├─ Data Entry Operator
        │                               │                               ├─ Support Executive
        │                               │                               ├─ Chartered Accountant
        │                               │                               └─ Operations Manager
        │
        ├─ Document Vault               ├─ Employee Profile
        ├─ Accounting                   ├─ Form 16 Upload
        ├─ Financial Dashboard          ├─ Tax Documents Upload
        ├─ GST Filing                   ├─ ITR Filing
        ├─ Loan Hub                     └─ Callback Support
        └─ Expert Chat / CA
```

---

# Architecture View

```text
┌─────────────────────────────────────────────────────────────┐
│                         SNAPACCOUNT                         │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼

┌───Mobile APP────┐ ┌───Mobile APP────┐ ┌─────Web Admin───┐
│ Business User   │ │ Employee User   │ │ Admin User      │
│ (SME)           │ │ (Individual)    │ │ (Internal)      │
└─────────────────┘ └─────────────────┘ └─────────────────┘

Accounting          Employee ITR       Data Processing
GST Filing          Tax Documents      User Support
Loan Hub            ITR Filing         CA Review
Reports             Callback Support   Operations
Document Vault                         Escalations

          └───────────────────┬───────────────────┘
                              │
                              ▼

                 ┌─────────────────────────┐
                 │ Shared Services         │
                 ├─────────────────────────┤
                 │ Authentication          │
                 │ OTP Verification        │
                 │ Document Vault          │
                 │ Notifications           │
                 │ Callback System         │
                 │ Expert Chat             │
                 └─────────────────────────┘
```

---

# Database-Oriented View

```text
Organization (SME)
│
├── Owner User
├── Accounting Module
├── GST Module
├── Dashboard Module
├── Loan Module
└── Documents

Employee User
│
├── Employee Profile
├── ITR Documents
├── Tax Computation
└── ITR Filing

Admin Users
│
├── Data Entry Operator
├── Support Executive
├── Chartered Accountant (CA)
└── Operations Manager
```
