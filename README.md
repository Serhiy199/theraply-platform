# Theraply Platform

Ukrainian version: [README.ua.md](./README.ua.md)

Theraply Platform is the private product workspace for clients, therapists, and administrators. The marketing site remains outside this repository; this app is intended to run on the product subdomain, for example `app.theraply.online`.

## Current Status

The MVP implementation is ready for final hosted acceptance testing.

Completed product areas:

- Project foundation, database schema, and private app shell.
- Credentials auth, role-based routing, email verification, forgot/reset password.
- Client, therapist, and admin dashboards.
- Client booking flow with therapist selection, Google Calendar availability, pending therapist confirmation, payment, cancellation, and booking history.
- Therapist onboarding, admin review, certificate upload, Google Calendar connection, Stripe Connect onboarding, requests, clients, session completion, no-show, and payout state.
- Admin users, therapists, bookings, payments, finance cases, transfer retry, and audit visibility.
- Stripe Checkout, webhook reconciliation, refunds, client credit, Stripe Connect transfers, and retry cron.
- Transactional email logging/delivery abstraction.
- Cron endpoints for unpaid booking rules and therapist transfer retry.
- Security hardening: route guards, ownership checks, payload validation, rate-limit foundation, safe errors, monitoring redaction, audit logs.
- Vitest test infrastructure and targeted unit/service coverage.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Ant Design
- NextAuth v4
- Prisma 6
- PostgreSQL
- Stripe Checkout and Stripe Connect
- Google Calendar / Google Meet
- Nodemailer SMTP
- Cloudinary certificate storage
- Wix forms sync support

## Key Runtime Flows

### Client

- Registers and verifies email.
- Chooses an approved therapist.
- Views slots from the therapist Google Calendar availability.
- Creates a pending booking request.
- Pays through Stripe Checkout after therapist confirmation.
- Cancels with the configured refund policy: `24h+` can refund, `<24h` is non-refundable after payment capture.

### Therapist

- Registers, verifies email, completes onboarding, and waits for admin approval.
- Connects Google Calendar and Stripe Connect.
- Sets session price.
- Confirms/rejects booking requests.
- Cancels confirmed paid sessions with automatic full refund.
- Marks sessions as completed or client no-show after the session end time.
- Completed/no-show paid sessions trigger a 90% therapist transfer with cron retry fallback.

### Admin

- Reviews users, therapists, bookings, payments, finance cases, and audit logs.
- Approves/rejects therapists.
- Cancels bookings manually.
- Reviews payment split and transfer state.
- Retries failed therapist transfers.

## Important Business Rules

- Clients pay only after therapist confirmation.
- Therapist cancellation of a paid session creates a full Stripe refund; client credit is not offered for that scenario.
- Client cancellation follows the 24-hour refund policy.
- Stripe Connect readiness is required before a therapist can accept payable bookings.
- Therapist payout uses separate charges and transfers: platform keeps 10%, therapist receives 90%.
- Transfer is created only after the therapist marks a paid session as completed or client no-show.
- Cron is used as retry/fallback, not as the primary completion mechanism.

## Implemented Routes

Public:

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/verify-email/[token]`
- `/403`

Client:

- `/client/dashboard`
- `/client/book/new`
- `/client/book/[therapistId]`
- `/client/bookings`
- `/client/bookings/[bookingId]`
- `/client/payments`
- `/client/payments/success`
- `/client/payments/failed`

Therapist:

- `/therapist/dashboard`
- `/therapist/onboarding`
- `/therapist/requests`
- `/therapist/requests/[bookingId]`
- `/therapist/clients`
- `/therapist/payout-details`

Admin:

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/bookings/[bookingId]`
- `/admin/payments`

API:

- `/api/auth/[...nextauth]`
- `/api/integrations/google/connect`
- `/api/integrations/google/callback`
- `/api/stripe/checkout`
- `/api/stripe/webhook`
- `/api/stripe/connect/account-link`
- `/api/stripe/connect/refresh`
- `/api/stripe/connect/return`
- `/api/cron/booking-rules`
- `/api/cron/therapist-transfers`
- `/api/therapist/certificates/upload-signature`
- `/api/therapist/certificates/confirm-upload`

## Database Notes

Core Prisma models include:

- `User`, `ClientProfile`, `TherapistProfile`
- `TherapistCertificate`, `TherapistReviewNote`
- `Booking`, `Session`, `Payment`
- `StripeWebhookEvent`
- `ClientCreditBalance`, `ClientCreditTransaction`
- `TherapistPayoutDetails`
- `EmailLog`, `AuditLog`
- `PasswordResetToken`, `EmailVerificationToken`

`TherapistPayoutDetails` is legacy storage kept for compatibility/history. New payout readiness and payout UX use Stripe Connect fields on `TherapistProfile`, plus payment transfer fields on `Payment`.

## Environment Variables

Required environment groups:

- App/auth: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`
- Cron: `CRON_SECRET`
- Stripe: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CERTIFICATES_FOLDER`
- Wix sync: `WIX_API_TOKEN`, `WIX_SITE_ID`, `WIX_THERAPIST_APPLICATION_FORM_ID`, `WIX_ACCOUNT_ID`
- Monitoring: `ERROR_MONITORING_PROVIDER`, `SENTRY_DSN`

## Useful Commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
npx.cmd prisma validate
npx.cmd prisma migrate status
npx.cmd prisma migrate deploy
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd test
npm.cmd run verify:security
npm.cmd run verify:phase10
```

## Current Verification Baseline

Latest local verification after the Stripe Connect migration:

- `npx prisma migrate status` passes and reports the DB is up to date.
- `npm run verify:security` passes.
- `npm run verify:phase10` passes.
- `npx tsc --noEmit --incremental false` passes.
- `npm test` passes: 17 files / 90 tests.
- `npm run lint` passes with no warnings.
- `npm run build` passes.

Known caveat: in the current Windows/local environment, `npm run build` can print Prisma TLS warnings while prerendering pages that try to read the configured remote DB. The build still completes successfully. Hosted environment DB connectivity should be confirmed during hosted QA.

## Production Notes

- The current rate limiter uses an in-memory store. This is acceptable as a baseline, but production should use a shared store such as Redis/Upstash when running multiple instances.
- Do not run seed commands against production unless intentionally creating/resetting demo data.
- Cron behavior should be verified on the final hosting platform because the project may move away from Vercel.
- Hosted QA checklist: [docs/hosted-qa-handoff-checklist.md](./docs/hosted-qa-handoff-checklist.md)
