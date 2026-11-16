# DI BARISTA

Specialty coffee store: customer storefront, admin dashboard and API.

```
backend/    NestJS API (MongoDB, Paymob payments, emails, file uploads)
frontend/   Next.js storefront (/en, /ar) and admin dashboard (/admin)
```

## Run locally

```bash
# 1. API (http://localhost:3001)
cd backend
# create .env (ask the team for the values)
npm install
npm run start:dev

# 2. Storefront + admin (http://localhost:3000)
cd frontend
# create .env.local (ask the team for the values)
npm install
npm run dev
```

MongoDB must be running (`DB_URL` in `backend/.env`).

## Notes

- Payments: Paymob Unified Checkout (cards and wallets) and cash on delivery.
  Paymob callbacks: `<API>/api/v1/payments/paymob/webhook` and `/callback`.
- Product photos uploaded from the dashboard are stored on the server disk
  (`STORAGE_DRIVER=local`, `UPLOAD_DIR`) and served at `/uploads`.
- Environment files (`.env`, `.env.local`, `.env.example`) are kept out of Git.
