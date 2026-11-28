# Deploying DI BARISTA on Hostinger

Two Node.js apps from this one repository, each on its own Hostinger website:

| Website | Folder | What it is |
| --- | --- | --- |
| `api.YOUR-DOMAIN.com` | `backend/` | NestJS API (orders, payments, dashboard data) |
| `YOUR-DOMAIN.com` | `frontend/` | Next.js storefront + `/admin` dashboard |

Node.js apps need a **Business** or **Cloud** hosting plan.

Unchanged services (already in use, nothing to move):
- Database: **Neon PostgreSQL** (do not create a Hostinger MySQL database; the app uses PostgreSQL)
- Cache / rate limits: **Upstash Redis**
- Product photos: **Vercel Blob** (Hostinger replaces the app folder on every deploy, so photos must not live on its disk)
- Emails: Gmail SMTP · Payments: Paymob

## 1. API website (`api.YOUR-DOMAIN.com`)

hPanel → Websites → Add website → Node.js app, domain `api.YOUR-DOMAIN.com`, then:

| Setting | Value |
| --- | --- |
| Node.js version | 22 |
| Root / app directory | `backend` |
| Framework | NestJS (or "Other") |
| Install | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm start` (runs `node dist/main`) |
| Entry file | `dist/main.js` |

Environment variables: paste `backend/.env.hostinger` (kept only on this computer, not in Git)
after replacing `YOUR-DOMAIN.com` with the real domain. Hostinger sets `PORT` itself.

Check: `https://api.YOUR-DOMAIN.com/api/v1/health` → `{"status":"ok","database":"ok","cache":"ok"}`

## 2. Storefront website (`YOUR-DOMAIN.com`)

| Setting | Value |
| --- | --- |
| Node.js version | 22 |
| Root / app directory | `frontend` |
| Framework | Next.js |
| Install | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm start` |

Environment variables: paste `frontend/.env.hostinger` (domain replaced). `NEXT_PUBLIC_*` values are
built into the pages, so after changing one, run a new build.

Deploy the API first: the storefront reads the products from it while building.

## 3. Auto-deploy from GitHub

hPanel → Websites → Manage → Advanced → Git: connect `bodajava/DI-BARISTA`, branch `main`,
directory `backend` for the API website and `frontend` for the storefront. Every push rebuilds.

## 4. After the switch

1. **Paymob** (Developers → Payment integrations, card integration): set
   - Transaction processed callback: `https://api.YOUR-DOMAIN.com/api/v1/payments/paymob/webhook`
   - Transaction response callback: `https://api.YOUR-DOMAIN.com/api/v1/payments/paymob/callback`
2. Place a test order (cash on delivery) and a test card payment.
3. Point the domain's DNS at Hostinger (hPanel shows the records) and wait for SSL.
4. Keep the Vercel projects until the Hostinger site is confirmed working, then delete them.

## What already works the same on Hostinger

- Background jobs (cancelling unpaid online orders) run every 5 minutes inside the API process;
  no cron job is needed. `/api/v1/jobs/run` stays available for an external cron (`CRON_SECRET`).
- Rate limits use the real customer IP: the storefront sends it with `INTERNAL_API_KEY`
  (same value in both apps).
- Builds were tested with production-only installs (`npm ci --omit=dev`) for both apps.
