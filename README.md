# LibraSaaS — Multi-Tenant Library Management

Next.js 16 (App Router) + MongoDB SaaS for library management. Har librarian ka
apna isolated tenant hota hai; platform admin librarians ko approve/reject karta hai.

## Roles

| Role | Kya kar sakta hai | Dashboard |
|---|---|---|
| **admin** | Librarians approve/reject, platform stats, contact messages, system settings | `/admin/dashboard` |
| **librarian** | Apne students, books, seats aur transactions manage karna | `/librarian` |

Registration hamesha `librarian` banata hai. Flow: register → email OTP verify →
admin approval → login.

## Setup

```bash
# 1. Dependencies
npm install

# 2. Env — .env.example copy karke real values bharo
cp .env.example .env

# 3. Dev server
npm run dev          # http://localhost:3000
```

Zaroori env vars: `MONGODB_URI`, `JWT_SECRET`, aur `RESEND_API_KEY` + `EMAIL_FROM`
(OTP emails ke liye). `JWT_SECRET` ke bina app boot hi nahi hoga — yeh jaan-boojh kar hai.

### Email

Do providers support hain, `.env` se switch hota hai — code me kuch nahi badalta.
`EMAIL_PROVIDER` set karo, ya khaali chhod do (SMTP_HOST set hai to `smtp`, warna `resend`).

| Provider | Free limit | Kya verify karna padta hai |
|---|---|---|
| **SMTP** (Brevo / Gmail) | Brevo 300/din, Gmail ~500/din | sirf ek **sender email** |
| **Resend** | 3000/mahina | poora **domain** (DNS records) |

Domain nahi hai to SMTP use karo — Brevo/Gmail me sirf ek email verify karni hoti
hai, isliye bina domain kharide real users ko mail ja sakti hai. Resend bina
verified domain ke sirf aapke apne account wale email par deliver karta hai.

Config check karne ke liye (asli email bheje bina):

```bash
node --env-file=.env scripts/check-email.mjs
node --env-file=.env scripts/check-email.mjs --send you@gmail.com
```

### SMS (student OTP for QR check-in)

Students verify their mobile number with an OTP. The provider is picked in
`.env` — no code changes. Set `OTP_CHANNEL` and fill in only that provider's keys
(all options are documented in `.env.example`):

| `OTP_CHANNEL` | Service | Notes |
|---|---|---|
| `fast2sms` | Fast2SMS | India only, quickest to start |
| `msg91` | MSG91 | India, needs a DLT-approved template |
| `2factor` | 2Factor.in | India |
| `twilio` | Twilio | Any country |
| `webhook` | Any other HTTP SMS API | Describe it with the `OTP_WEBHOOK_*` variables |
| `console` | none | Prints the code in the server terminal — local dev only |

```bash
npx tsx --env-file=.env scripts/check-sms.ts                     # check config
npx tsx --env-file=.env scripts/check-sms.ts --send 9876543210   # send a real test SMS
```

On Vercel, add the same variables under Project → Settings → Environment Variables.
A production build refuses the `console` channel unless `ALLOW_CONSOLE_OTP=true`.

### Pehla admin banana

Registration sirf librarian banata hai, isliye pehla admin DB me manually
banana padta hai (ya `role: 'admin'`, `isVerified: true`, `isApproved: true`
set karke existing user ko promote karo).

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build (TypeScript errors build ko fail karenge)
npm run start    # production server
npm run lint     # eslint
```

### One-time migration

Agar aapka DB is change se pehle ka hai, purana global `isbn_1` index drop karna hoga
(ab ISBN per-librarian unique hai, globally nahi):

```bash
node --env-file=.env scripts/drop-legacy-isbn-index.mjs
```

## Project Structure

```
app/
├── api/                  # 35 route handlers
│   ├── auth/             # register, login, OTP, password reset (public + rate-limited)
│   ├── admin/            # admin-only: librarians, stats, settings
│   ├── books/ students/ seats/ transactions/   # librarian ka tenant-scoped data
│   └── messages/         # POST public (contact form), GET admin-only
├── admin/                # admin dashboard pages
├── librarian/            # librarian dashboard pages
└── (login, register, onboarding, forgot-password, marketing pages)

lib/
├── models/               # Mongoose schemas (User, Book, Student, Seat, Transaction, ...)
├── middleware/auth.ts    # JWT verify + role guards (requireAdmin / requireLibrarian)
├── services/             # tenant-scoped business logic (transactions)
├── rate-limit.ts         # in-memory rate limiter
└── api-response.ts       # shared response + error mapping

proxy.ts                  # /admin aur /librarian routes ka server-side gate
```

## Security notes

- **Auth**: JWT (7 din) httpOnly cookie me. `authenticateRequest()` har request par
  DB se user ka status/approval dobara check karta hai — sirf token verify karna
  kaafi nahi maana gaya.
- **Tenant isolation**: har document par `librarianId`. Librarian sirf apna data
  dekh/badal sakta hai; admin ke liye restriction nahi.
- **Rate limiting**: `lib/rate-limit.ts` in-memory hai — single instance ke liye theek,
  lekin multi-instance/serverless deploy par Redis (Upstash) par shift karna padega.
- **`.env` kabhi commit mat karna.** Sirf `.env.example` track hoti hai.
