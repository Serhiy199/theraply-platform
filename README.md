# Theraply Platform

Ukrainian version: [README.ua.md](./README.ua.md)

Theraply Platform is the product application built with Next.js for three core roles:

- clients
- therapists
- administrators

The marketing website remains outside this repository. This codebase contains the platform application that will run on a dedicated product subdomain.

## Current Status

Completed phases:

- `Phase 1` - project initialization
- `Phase 2` - database design and PostgreSQL bootstrap
- `Phase 3` - authentication, password recovery, and route protection
- `Phase 4` - private app shell, role dashboards, and core internal navigation
- `Stages 5-7` - operational modules for client, therapist, and admin
- `Phase 8` - end-to-end booking flow
- `Phase 9` - Google Calendar integration

The current application already includes:

- client self-signup
- credentials-based login with `NextAuth`
- forgot-password and reset-password flows
- protected role-based routes
- a shared private dashboard shell
- role-specific overview dashboards for `client`, `therapist`, and `admin`
- a real client module for bookings, booking details, payments, and cancellation
- a real therapist module for requests, sessions, clients, and payout details
- a real admin module for users, therapists, bookings, payments, manual cancellation, and audit visibility
- strict server-side role guards for mutation actions
- shared empty, loading, success, and error states across the private workspace
- a server-side Prisma service layer for dashboards, bookings, sessions, payments, admin operations, and booking flow
- therapist selection and slot selection for the new client booking flow
- booking request creation with the `PENDING_THERAPIST` status
- a unified end-to-end booking flow between client, therapist, and admin
- therapist-owned Google Calendar connection and target calendar selection
- real therapist availability from Google Calendar `freeBusy`
- conflict-aware booking creation with database and Google Calendar guards
- automatic Google Calendar event creation after therapist confirmation
- automatic Google Meet link generation and storage in `Session`
- Google Calendar event cleanup on reject / cancel flows
- Google Calendar audit logging and diagnostics for connect, sync, and failure events
- booking-flow-specific empty, loading, conflict, and success states

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

## Implemented Phases

### Phase 1

Completed foundation work:

- initialized the application with the Next.js App Router
- connected Ant Design through a global provider
- created base public pages:
  - `/`
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/403`
  - `not-found`
- configured Prisma
- configured local environment variables
- prepared local PostgreSQL in WSL

### Phase 2

Completed database design and local bootstrap:

- designed and implemented the Prisma schema
- created and applied the first domain migration
- added the auth migration for password reset tokens
- created and executed seed data for local development
- verified database access through Prisma Client and Prisma Studio

### Phase 3

Completed the authentication and authorization foundation:

- configured `NextAuth` with `CredentialsProvider`
- added password hashing with `bcryptjs`
- implemented client self-signup
- implemented credentials-based login
- implemented forgot-password flow
- implemented reset-password flow
- added JWT session support
- added route protection through `proxy.ts`
- added role-based redirects after login
- created protected base dashboards for all three roles
- verified registration, login, reset token generation, and password update locally and in the deployed environment

### Phase 4

Completed the private product workspace foundation:

- built a shared dashboard shell with header, sidebar, and logout controls
- added role-aware layouts for `client`, `therapist`, and `admin`
- configured live internal navigation for private routes
- created child routes for future bookings, payments, therapist, and admin modules
- implemented role-specific overview dashboards:
  - client workspace with upcoming sessions, payment summary, quick actions, and account summary
  - therapist workspace with pending requests, client summary, and profile/payout completion
  - admin workspace with users, approvals, bookings, payments, and recent activity
- added a server-side dashboard data layer in `dashboard.service.ts`
- made the private shell auth-aware so the signed-in user can see identity, role, session state, and logout controls

### Stages 5-7

Completed the first operational block for all three roles:

- added shared booking and payment contracts in `src/lib/contracts/bookings.ts`
- added shared labels, badge mappings, and policy helpers for booking and payment statuses
- created role-specific service layers:
  - `client-bookings.service.ts`
  - `therapist-bookings.service.ts`
  - `admin-operations.service.ts`
- implemented the client module:
  - upcoming sessions
  - past sessions
  - booking details page
  - payments page
  - client cancellation flow
  - late cancellation warning for sessions under 24 hours
  - meeting link visibility when available
- implemented the therapist module:
  - pending requests
  - upcoming sessions
  - session history
  - clients list
  - request detail page
  - confirm and reject actions
  - payout details view and update flow
- implemented the admin module:
  - users list
  - therapists list
  - bookings list
  - booking details page
  - payments list
  - manual admin cancellation
  - audit trail visibility
- protected server actions with shared role guards so every mutation is enforced on the server
- added shared empty, loading, and status states across the private workspace

### Phase 8

Completed the core booking flow end-to-end:

- added a dedicated booking flow service in `src/server/services/booking-flow.service.ts`
- added shared contracts, constants, and validation for booking flow:
  - `src/lib/contracts/booking-flow.ts`
  - `src/lib/constants/booking-flow.ts`
  - `src/lib/validations/booking-flow.ts`
- implemented the client booking flow:
  - therapist selection page
  - therapist availability page
  - slot request submission
  - conflict-aware states in the booking request form
- integrated therapist confirm and reject actions with the new booking flow service
- automatically generate and store a meeting link after therapist confirmation
- added dedicated empty, loading, and conflict states for the booking flow
- added the end-to-end verification script `scripts/verify-stage-8.ts`

### Phase 9

Completed Google Calendar integration:

- added Google OAuth configuration and therapist connection flow
- added Google callback handling and token storage in `TherapistProfile`
- added target calendar selection for therapist-owned Google accounts
- replaced local slot generation with Google Calendar availability from `freeBusy`
- added booking creation protection against Google and database slot conflicts
- create a real Google Calendar event after therapist confirmation
- store Google event references and Google Meet links in `Session`
- delete Google Calendar events on reject and cancel flows
- added dashboard UI indicators for connection state and Google Meet sync state
- added audit logging and runtime diagnostics for Google Calendar integration lifecycle events

## Implemented Routes

### Public routes

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Protected routes for client

- `/client/dashboard`
- `/client/book/new`
- `/client/book/[therapistId]`
- `/client/bookings`
- `/client/bookings/[bookingId]`
- `/client/payments`

### Protected routes for therapist

- `/therapist/dashboard`
- `/therapist/requests`
- `/therapist/requests/[bookingId]`
- `/therapist/clients`
- `/therapist/payout-details`

### Protected routes for admin

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/bookings/[bookingId]`
- `/admin/payments`

### Auth API

- `/api/auth/[...nextauth]`

### Integration API

- `/api/integrations/google/connect`
- `/api/integrations/google/callback`

## Database Model

### Enums

- `UserRole`
- `TherapistApprovalStatus`
- `BookingStatus`
- `SessionStatus`
- `PaymentStatus`
- `EmailStatus`

### Models

- `User`
- `ClientProfile`
- `TherapistProfile`
- `Booking`
- `Session`
- `Payment`
- `TherapistPayoutDetails`
- `EmailLog`
- `AuditLog`
- `PasswordResetToken`

### Important domain notes

- roles are stored in `User.role`
- `ClientProfile` and `TherapistProfile` are separate one-to-one role profiles
- `Booking` describes booking state and booking intent
- `Session` describes the actual session and is linked one-to-one with `Booking`
- `Payment` is stored separately from `Booking`
- password recovery tokens are stored in `PasswordResetToken`
- therapist availability is planned around Google Calendar
- therapist availability is read from Google Calendar `freeBusy`
- Google Calendar replaced Calendly in the updated requirements
- each therapist will connect their own Google account for calendar sync
- booking requests stay in `PENDING_THERAPIST` until the therapist decides
- after therapist confirmation, the platform creates the Google Calendar event and stores the resulting meeting link
- reject and cancel flows remove the synced Google Calendar event when one exists
- Google Calendar lifecycle events are written into `AuditLog`

## Project Structure

```text
theraply-platform/
|- prisma/
|  |- migrations/
|  |- schema.prisma
|  \- seed.ts
|- public/
|- scripts/
|- src/
|  |- app/
|  |- components/
|  |- lib/
|  |- server/
|  |- types/
|  \- proxy.ts
|- .env
|- .env.example
|- .env.production.local.example
|- package.json
|- prisma.config.ts
|- README.md
\- README.ua.md
```

## Local Environment

Example local database connection:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/theraply_platform"
```

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

Setup requirements:

- enable `Google Calendar API` in Google Cloud
- create an OAuth 2.0 Web application client
- register `http://localhost:3000/api/integrations/google/callback` for local development
- register `https://your-domain/api/integrations/google/callback` for deployed environments
- set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REDIRECT_URI`

Current runtime behavior:

- therapists connect their own Google account from `/therapist/payout-details`
- Theraply reads available slots from Google Calendar `freeBusy`
- booking requests remain in `PENDING_THERAPIST` until therapist action
- therapist confirmation creates a Google Calendar event and stores the Google Meet link
- reject and cancel flows delete the synced Google Calendar event
- connection, token refresh, event sync, and failure scenarios are logged to `AuditLog`

More details are documented in [docs/phase-9-google-calendar-integration.md](./docs/phase-9-google-calendar-integration.md).

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

Run the verification script for Stages 5-7:

```bash
npx tsx scripts/verify-stages-5-7.ts
```

Run the verification script for Phase 8:

```bash
npx tsx scripts/verify-stage-8.ts
```

## Remote production / Vercel database

The project can work against the remote Vercel / Prisma Postgres database directly when the local environment should use the shared remote database as the main datasource.

1. Copy the template:

```bash
cp .env.production.local.example .env.production.local
```

2. Paste the remote `DATABASE_URL` from Vercel / Prisma Postgres into `.env.production.local`.

3. If you want the local project itself to use the remote database as the primary datasource, mirror the same `DATABASE_URL` into `.env`.

4. Run migrations for the remote database:

```bash
npm run prisma:migrate:remote
```

5. Run seed for the remote database only when you explicitly want to write seed data into that shared environment:

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
- `Phase 4` is verified through the build and private role routes
- `Stages 5-7` are verified through `scripts/verify-stages-5-7.ts`
- `Phase 8` is verified through `scripts/verify-stage-8.ts`
- `Phase 9` is verified through Google Calendar connect, availability, confirm, and cancellation sync flows
- `npm run build` passes successfully
- `npm run dev` starts correctly

## What Comes Next

The most logical next steps are:

- Stripe payments and webhook logic
- email notifications
- production hardening, filters, pagination, and monitoring

Phase 9 implementation notes are documented in [docs/phase-9-google-calendar-integration.md](./docs/phase-9-google-calendar-integration.md).

Phase 10 payment contract is documented in [docs/phase-10-stripe-payments.md](./docs/phase-10-stripe-payments.md).

Current Stripe setup can begin with placeholder values in env templates, and real key values can be added later when the Stripe account credentials are available.
