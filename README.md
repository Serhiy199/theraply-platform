# Theraply Platform

Theraply Platform is a Next.js application for three core roles:
- clients
- therapists
- admins

The marketing website remains outside this repository. This project contains the application layer that will live on the dedicated platform subdomain.

## Current Status

The project currently includes completed `Phase 1` and `Phase 2` work:
- project scaffold on Next.js + TypeScript
- UI foundation with Ant Design
- Prisma + PostgreSQL local setup in WSL
- first production-oriented domain schema
- first migration applied to local database
- seed script with test accounts

`Phase 3` has not started yet.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Ant Design
- Prisma 6
- PostgreSQL

## Implemented So Far

### Phase 1

Completed foundation work:
- initialized the application with Next.js App Router
- connected Ant Design through a global provider
- created base pages:
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

Completed database design and local database bootstrap:
- designed and implemented the Prisma schema
- created and applied the first migration
- created and executed seed data for local development
- verified database access through Prisma Client and Prisma Studio

## Database Model

The current schema includes these enums:
- `UserRole`
- `TherapistApprovalStatus`
- `BookingStatus`
- `SessionStatus`
- `PaymentStatus`
- `EmailStatus`

The current schema includes these models:
- `User`
- `ClientProfile`
- `TherapistProfile`
- `Booking`
- `Session`
- `Payment`
- `TherapistPayoutDetails`
- `EmailLog`
- `AuditLog`

### Important Domain Notes

- roles are stored in `User.role`
- `ClientProfile` and `TherapistProfile` are separate one-to-one role profiles
- `Booking` represents booking state and scheduling intent
- `Session` represents the actual session entity and is linked one-to-one with `Booking`
- `Payment` is stored separately from `Booking`
- therapist availability is planned around Google Calendar
- Google Calendar replaced Calendly in the updated requirements

## Project Structure

```text
theraply-platform/
|- prisma/
|  |- migrations/
|  |- schema.prisma
|  \- seed.ts
|- public/
|- src/
|  |- app/
|  |- components/
|  \- lib/
|- .env
|- .env.example
|- package.json
\- README.md
```

## Local Environment

Current local database connection:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/theraply_platform"
```

Other environment variables already prepared:
- `NEXT_PUBLIC_APP_URL`
- `AUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

## Useful Commands

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Create/apply future migrations:

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

Build the project:

```bash
npm run build
```

## Seeded Test Accounts

The local seed currently creates:
- 1 admin
- 2 therapists
- 2 clients

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

## Migration Status

The first migration has already been created and applied locally.

Migration folder:
- `prisma/migrations/20260408132556_init_domain_schema`

This migration creates:
- enums
- application tables
- indexes
- uniqueness constraints
- Prisma migration tracking table

## Notes

- local password hashes in seed are temporary development placeholders for now
- proper authentication hashing will be finalized during `Phase 3`
- Prisma currently shows a warning that `package.json#prisma.seed` will be deprecated in Prisma 7
- when we move forward, this can be migrated to `prisma.config.ts`

## Next Step

The next planned phase is:
- `Phase 3: Authentication and roles`

That phase will include:
- registration
- login
- forgot/reset password flow
- protected routes
- role-based access control
- redirects into the correct dashboard


