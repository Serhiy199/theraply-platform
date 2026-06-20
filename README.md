# Theraply Platform

Theraply is a Next.js MVP for booking online therapy sessions. It supports three product roles:

- `Client`: registers, verifies email, browses approved therapists, requests sessions, pays, and manages bookings.
- `Therapist`: registers, completes onboarding, submits a profile for admin review, connects Google Calendar and Stripe Connect, manages booking requests, and settles sessions.
- `Admin`: reviews therapists, monitors users, bookings, payments, refunds, transfers, and audit logs.

The MVP is implemented as a full-stack App Router application with PostgreSQL persistence through Prisma.

## Main Features

- Client registration, login, email verification, and password reset.
- Therapist onboarding with draft save, certificate upload, profile submission, admin approval, rejection, and requested changes.
- Therapist profile visibility only after email verification, completed onboarding, admin approval, Stripe payout readiness, and required booking data.
- Client booking flow with Google Calendar availability, duplicate slot protection, therapist confirmation, cancellation, and booking history.
- Google Calendar OAuth, free/busy availability, calendar event creation/deletion, and Google Meet link generation.
- Stripe Checkout payments in GBP after therapist confirmation.
- Stripe Connect onboarding for therapist payouts.
- 10% platform fee and 90% therapist transfer after completed sessions, client no-show, or late client cancellation.
- Refund/no-refund rules for therapist, admin, and client cancellation scenarios.
- Admin dashboard for users, therapists, bookings, payments, and audit trail.
- Email notifications with `EmailLog` records.
- Role-based route protection, rate limits, payload validation, and security verification scripts.

## Tech Stack

- Framework: Next.js `16.2.2` App Router
- UI/runtime: React `19.2.4`, Ant Design `6`, Tailwind CSS `4`
- Language: TypeScript `5`
- Database: PostgreSQL
- ORM: Prisma `6.15`
- Auth: NextAuth v4 credentials provider with JWT sessions
- Payments: Stripe Checkout and Stripe Connect
- Calendar/video: Google Calendar API and Google Meet conference creation
- Email: Nodemailer SMTP with console delivery outside production
- File storage: Cloudinary signed uploads for therapist certificates
- Testing/build: Vitest, ESLint, TypeScript, custom verification scripts, `next build`

## Local Development

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev
npm run dev
```

Open `http://localhost:3000`.

For production-like checks:

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run test:unit
npm run verify:security
npm run verify:phase10
npm run build
```

## Scripts

- `npm run dev`: starts the Next.js development server.
- `npm run build`: creates a production build.
- `npm run start`: starts the built Next.js server.
- `npm run lint`: runs ESLint.
- `npm run test`: runs all Vitest tests.
- `npm run test:unit`: runs unit tests under `tests/unit`.
- `npm run verify:security`: runs the security/configuration verification script.
- `npm run verify:phase10`: verifies the Stripe payment flow.
- `npm run verify:phase11-email`: verifies email/onboarding records.
- `npm run verify:email-records`: verifies email verification records.
- `npm run verify:therapist-onboarding`: verifies therapist onboarding behavior.
- `npm run verify:cron-booking-rules`: verifies cron booking rules.
- `npm run prisma:generate`: runs Prisma Client generation.
- `npm run prisma:migrate:dev`: runs local development migrations.
- `npm run prisma:studio`: opens Prisma Studio.
- `npm run prisma:migrate:remote`: runs the remote migration helper.
- `npm run prisma:seed:remote`: runs the remote seed helper.

## Environment

Use `.env.example` as the safe template. It contains placeholder values only. Detailed variable notes are in [docs/environment.md](docs/environment.md).

Important groups:

- App/auth: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`
- Cron: `CRON_SECRET`
- Stripe: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`
- Cloudinary certificates: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CERTIFICATES_FOLDER`
- Optional Wix sync: `WIX_API_TOKEN`, `WIX_SITE_ID`, `WIX_THERAPIST_APPLICATION_FORM_ID`, `WIX_ACCOUNT_ID`

## Documentation

- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Environment](docs/environment.md)
- [User roles](docs/user-roles.md)
- [Therapist flow](docs/therapist-flow.md)
- [Booking flow](docs/booking-flow.md)
- [Session statuses](docs/session-statuses.md)
- [Stripe payments](docs/payments-stripe.md)
- [Google Calendar](docs/google-calendar.md)
- [Emails](docs/emails.md)
- [Admin dashboard](docs/admin-dashboard.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Production checklist](docs/production-checklist.md)
- [Post-MVP roadmap](docs/post-mvp-roadmap.md)
- [Known risks](docs/known-risks.md)

## Deployment Note

Before production launch, configure a production PostgreSQL database, `AUTH_SECRET`, app URLs, Stripe live keys and webhook endpoint, Google OAuth production redirect URI, SMTP credentials, Cloudinary certificate storage, `CRON_SECRET`, and the production domain. If deployed on Vercel, configure the two cron routes in `vercel.json` and verify they call the API with `Authorization: Bearer <CRON_SECRET>`.
