# Theraply Platform

Ukrainian version: [README.ua.md](./README.ua.md)

Theraply Platform is the product application built with Next.js for three core roles:

- clients
- therapists
- administrators

The marketing website remains outside this repository. This codebase contains the private product workspace that runs on the platform subdomain.

## Current Status

Completed phases:

- `Phase 1` - project initialization
- `Phase 2` - database design and PostgreSQL bootstrap
- `Phase 3` - authentication, password recovery, and route protection
- `Phase 4` - private app shell, role dashboards, and core internal navigation
- `Stages 5-7` - operational modules for client, therapist, and admin
- `Phase 8` - end-to-end booking flow
- `Phase 9` - Google Calendar integration
- `Phase 10` - Stripe payments, refunds, client credit, and finance visibility

The current application already includes:

- client self-signup and credentials-based login with `NextAuth`
- forgot-password and reset-password flows
- protected role-based routes
- private dashboards for `client`, `therapist`, and `admin`
- real booking, payment, and cancellation flows for clients
- therapist requests, sessions, clients, payout details, and pricing
- admin oversight for users, therapists, bookings, payments, and audit logs
- end-to-end Google Calendar sync with therapist-owned calendars
- Stripe Checkout from client booking details
- Stripe webhook processing for success, failure, expiry, and refund events
- refund flow for standard client cancellation and platform-driven paid cancellation
- client credit issuance, application, reversal, and balance tracking
- late cancellation UX for `< 24 hours`
- admin finance visibility for pending, failed, refunded, and credit-backed cases
- audit logging across Google Calendar, Stripe, refund, and client-credit lifecycle events

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Ant Design
- NextAuth v4
- Prisma 6
- PostgreSQL
- bcryptjs
- Zod
- Stripe

## Implemented Phases

### Phase 8

Completed the core booking flow end-to-end:

- therapist selection and slot selection for the client flow
- booking request creation with `PENDING_THERAPIST`
- therapist confirm / reject flow
- meeting link creation and session linkage
- end-to-end verification script in `scripts/verify-stage-8.ts`

### Phase 9

Completed Google Calendar integration:

- therapist-owned Google OAuth connection
- target calendar selection
- real availability from Google Calendar `freeBusy`
- conflict-aware booking creation with database and Google checks
- Google Calendar event creation after therapist confirmation
- Google Meet link storage in `Session`
- synced event cleanup on reject / cancel
- UI indicators and audit logging for the Google integration lifecycle

### Phase 10

Completed Stripe payment and compensation implementation:

- therapist-specific pricing through `sessionPricePence`
- server-side payment eligibility checks
- `GBP` payment flow after therapist confirmation
- payment deadline enforcement at `24 hours` before session start
- `Stripe Checkout` session creation from client booking details
- payment success and failed pages
- webhook handling for:
  - `checkout.session.completed`
  - `payment_intent.payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`
- standard client cancellation refund logic
- platform-side paid cancellation refund logic
- client credit balance and transaction model
- automatic client credit application before Stripe charge
- partial credit + Stripe mixed settlement
- full settlement by client credit without opening Stripe Checkout
- credit reversal on failed or expired checkout
- refund-time restoration of previously applied credit
- admin finance visibility for problematic payment states
- audit logging for checkout, webhook, refund, and client credit lifecycle events

## Implemented Routes

### Public routes

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Client routes

- `/client/dashboard`
- `/client/book/new`
- `/client/book/[therapistId]`
- `/client/bookings`
- `/client/bookings/[bookingId]`
- `/client/payments`
- `/client/payments/success`
- `/client/payments/failed`

### Therapist routes

- `/therapist/dashboard`
- `/therapist/requests`
- `/therapist/requests/[bookingId]`
- `/therapist/clients`
- `/therapist/payout-details`

### Admin routes

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/bookings/[bookingId]`
- `/admin/payments`

### API routes

- `/api/auth/[...nextauth]`
- `/api/integrations/google/connect`
- `/api/integrations/google/callback`
- `/api/stripe/checkout`
- `/api/stripe/webhook`

## Database Model

### Enums

- `UserRole`
- `TherapistApprovalStatus`
- `BookingStatus`
- `SessionStatus`
- `PaymentStatus`
- `CompensationResolutionType`
- `ClientCreditTransactionType`
- `EmailStatus`

### Models

- `User`
- `ClientProfile`
- `TherapistProfile`
- `Booking`
- `Session`
- `Payment`
- `ClientCreditBalance`
- `ClientCreditTransaction`
- `TherapistPayoutDetails`
- `EmailLog`
- `AuditLog`
- `PasswordResetToken`

### Important domain notes

- roles are stored in `User.role`
- `Booking` tracks booking state and intent
- `Session` tracks the actual session and meeting metadata
- `Payment` tracks Stripe identifiers, checkout expiry, refund metadata, and applied credit
- `ClientCreditBalance` and `ClientCreditTransaction` treat platform credit as a first-class domain concept
- booking compensation is resolved through `compensationResolutionType`
- therapist availability is sourced from Google Calendar `freeBusy`
- payment starts only after therapist confirmation

## Local Environment

Environment variables expected by the project:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXTAUTH_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

## Google Calendar Integration

Phase 9 uses therapist-owned Google accounts.

Current runtime behavior:

- therapists connect their own Google account from `/therapist/payout-details`
- Theraply reads availability from Google Calendar `freeBusy`
- bookings remain in `PENDING_THERAPIST` until therapist action
- confirmation creates the Google Calendar event and stores the Google Meet link
- reject and cancel flows delete the synced Google Calendar event
- connection, token refresh, sync, and failure events are logged to `AuditLog`

More details: [docs/phase-9-google-calendar-integration.md](./docs/phase-9-google-calendar-integration.md)

## Stripe Payments

Phase 10 is implemented with Stripe test-mode support for development and hosted testing.

Current runtime behavior:

- therapist confirms first, then the client can pay
- the payable amount comes from therapist-specific `GBP` pricing
- client credit is applied automatically before Stripe Checkout
- full-credit bookings settle without opening Stripe Checkout
- partial-credit bookings charge only the remainder through Stripe
- Stripe webhooks remain the source of truth for payment confirmation
- standard client cancellation (`24h+`) can create a Stripe refund
- late cancellation (`< 24h`) requires explicit confirmation and is treated as non-refundable once payment is captured
- paid platform-side cancellation can create a Stripe refund
- checkout, webhook, refund, and credit events are written to `AuditLog`

Required Stripe variables:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Recommended local Stripe setup:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use `pk_test` and `sk_test` from Stripe Dashboard, then copy the CLI-provided `whsec_...` into local `.env`.

Hosted test setup:

- keep Stripe in `Test mode`
- create a webhook endpoint for `https://your-domain/api/stripe/webhook`
- place that hosted signing secret into `STRIPE_WEBHOOK_SECRET`

More details: [docs/phase-10-stripe-payments.md](./docs/phase-10-stripe-payments.md)

## Useful Commands

Install dependencies:

```bash
npm install
```

Run the application locally:

```bash
npm run dev
```

Build the project:

```bash
npm run build
```

Generate Prisma Client:

```bash
npm run prisma:generate
```

Create and apply a local migration:

```bash
npm run prisma:migrate:dev -- --name your_migration_name
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

Run seed manually:

```bash
npx prisma db seed
```

Forward Stripe webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Run the Phase 10 verification script:

```bash
npm run verify:phase10
```

## Remote production / Vercel database

The project can work against the remote Vercel / Prisma Postgres database directly when the local environment should use the shared remote database as the main datasource.

1. Copy the template:

```bash
cp .env.production.local.example .env.production.local
```

2. Paste the remote `DATABASE_URL` from Vercel / Prisma Postgres into `.env.production.local`.

3. If you want the local project to use the remote database as the primary datasource, mirror the same `DATABASE_URL` into `.env`.

4. Run remote migrations:

```bash
npm run prisma:migrate:remote
```

5. Run remote seed only when you intentionally want to write seed data into that shared environment:

```bash
npm run prisma:seed:remote
```

## Test Accounts

### Admin

- email: `admin@theraply.local`
- password: `Admin123!`

### Therapists

- email: `therapist.anna@theraply.local`
- password: `Therapist123!`

- email: `therapist.david@theraply.local`
- password: `Therapist123!`

### Clients

- email: `client.emma@theraply.local`
- password: `Client123!`

- email: `client.james@theraply.local`
- password: `Client123!`

## Verification Summary

Current verified state:

- `Phase 3` is verified through registration, login, reset flow, and JWT session behavior
- `Phase 4` is verified through build and private role routes
- `Stages 5-7` are verified through operational flows and route checks
- `Phase 8` is verified through booking creation, confirmation, and session linkage
- `Phase 9` is verified through Google Calendar connect, availability, confirm, and cancellation sync flows
- `Phase 10` is verified through `scripts/verify-phase-10.ts`, plus build-passing Stripe checkout, webhook, refund-state, credit, late-cancellation, and admin-finance flows
- `npm run build` passes successfully
- `npm run dev` starts correctly

## What Comes Next

The most logical next steps are:

- email notifications
- production hardening, filters, pagination, and monitoring
- final end-to-end payment verification in hosted test mode
