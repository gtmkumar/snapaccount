# Local Stack — bring everything up + verify with API + UI

End-to-end recipe to run all 12 backend services + admin frontend + dev seed
data, then sanity-check that the admin UI is showing real DB-fetched content
(not mock fallbacks).

---

## 1. Prerequisites

```bash
# Docker (postgres + redis) — required
docker --version

# .NET 10 SDK + Aspire
dotnet --list-sdks         # expect 10.x
dotnet workload list       # expect 'aspire' present

# Node 22+ for the admin frontend
node --version
```

If you don't have `pgvector` locally, the postgres container in
`docker-compose.yml` ships with the extension pre-installed.

---

## 2. Start postgres + redis

```bash
cd /Users/gtmkumar/Documents/source/snapaccount
docker compose up postgres redis -d
docker compose ps    # confirm both healthy
```

Postgres listens on `localhost:5432` (`snapaccount` / `postgres` / `postgresql`).

---

## 3. Apply schema migrations + seeds

```bash
# Schema
for f in database/migrations/*.sql; do
  PGPASSWORD=postgresql psql -h localhost -U postgres -d snapaccount -f "$f"
done

# Dev users + canned tokens (DEV_AUTH_BYPASS flow)
PGPASSWORD=postgresql psql -h localhost -U postgres -d snapaccount \
  -f database/dev-seed/100_dev_users.sql

# Realistic business data across all 12 services
PGPASSWORD=postgresql psql -h localhost -U postgres -d snapaccount \
  -f database/dev-seed/200_dev_business_data.sql
```

The 200_ seed prints row counts at the end so you can confirm:

```
✓ loan.partner_banks   : 2 rows
✓ loan.loan_products   : 2 rows
✓ loan.applications    : 1 rows
✓ gst.gst_invoices     : 2 rows
✓ gst.itc_records      : 2 rows
✓ itr.assessee_profiles: 1 rows
✓ itr.filings          : 1 rows
✓ itr.grievances       : 1 rows
✓ callback.callbacks   : 1 rows
✓ subscription.subscriptions: 1 rows
```

---

## 4. Set per-service secrets (once per machine)

```bash
cd backend
for svc in AuthService DocumentService AccountingService GstService \
           ItrService LoanService ChatService NotificationService \
           ReportService SubscriptionService AiService CallbackService; do
  cd Services/$svc/${svc}.Api
  dotnet user-secrets init 2>/dev/null
  dotnet user-secrets set "DB_PASSWORD" "postgresql"
  dotnet user-secrets set "DEV_AUTH_BYPASS" "true"
  cd ../../..
done
```

`DEV_AUTH_BYPASS=true` makes `FirebaseAuthMiddleware` accept three canned
tokens — no Firebase setup required:
- `dev-superadmin-token` → user `11111111-…`
- `dev-admin-token` → user `22222222-…`
- `dev-user-token` → user `33333333-…` (org `44444444-…`)

---

## 5. Start the backend (Aspire)

```bash
cd backend
dotnet run --project AppHost
# Aspire dashboard: http://localhost:15888
# Each service exposes its own port; the dashboard lists them.
```

---

## 6. Start the admin frontend

```bash
cd src/admin
npm install
npm run dev    # http://localhost:5173
```

The admin login page accepts any of the three canned phone numbers in dev mode
(see `100_dev_users.sql` for the user/org mapping).

---

## 7. Smoke-test the API + UI integration

| URL | What to look for |
|---|---|
| http://localhost:5173/loans | One application visible (Acme Trading, ₹15L, SUBMITTED) |
| http://localhost:5173/settings/partner-banks | Two banks (HDFC, ICICI) — **NOT** the old "SBI" mock |
| http://localhost:5173/gst | Two invoices for Acme |
| http://localhost:5173/itr | One filing AY2025-26, ITR-3 |
| http://localhost:5173/callbacks | One pending callback |
| http://localhost:5173/dashboard | ⚠️ Still shows mocks — see `static-data-debt.md` |

If the **Partner Banks** page shows "HDFC Bank" + "ICICI Bank" (with the
"REST_JSON" / "REST_XML" adapter type pulled from the DB), the API integration
is healthy. If it shows "SBI", you're looking at the cached old-build bundle —
hard-refresh.

---

## 8. Run cross-org / IDOR sanity checks

```bash
# As Acme owner — should return their org's data
curl -H 'Authorization: Bearer dev-user-token' \
  http://localhost:<loan-port>/loans/applications

# As Super Admin (no org) — should see all orgs
curl -H 'Authorization: Bearer dev-superadmin-token' \
  http://localhost:<loan-port>/loans/applications

# Cross-org — try fetching Acme's app id with admin (different org) token; expect 404
curl -H 'Authorization: Bearer dev-admin-token' \
  http://localhost:<loan-port>/loans/applications/53333333-3333-3333-3333-333333333331
```

---

## 9. Pages that still show mocks

See `docs/dev/static-data-debt.md` for the full inventory and the backend
endpoints that would need to exist to remove each one. Tracked under
`STATIC-DATA-DEBT-7` markers in the source.
