# Theraply Platform

Ukrainian version: [README.ua.md](./README.ua.md)

Theraply Platform is a Next.js product application for three core roles:
- clients
- therapists
- admins

The marketing website remains outside this repository. This codebase contains the platform application that will run on a dedicated product subdomain.

## Current Status

Completed phases:
- `Phase 1` - project initialization
- `Phase 2` - database design and PostgreSQL bootstrap
- `Phase 3` - authentication, password recovery, and route protection
- `Phase 4` - private app shell, role dashboards, and navigation foundations

The current application already includes:
- client self-signup
- credentials-based login with `NextAuth`
- forgot-password and reset-password flows
- protected role-based routes
- shared private dashboard shell
- role-specific overview dashboards for `client`, `therapist`, and `admin`
- child dashboard routes for the next business modules
- server-side dashboard data layer powered by Prisma

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
- initialized the application with Next.js App Router
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

Completed database design and local database bootstrap:
- designed and implemented the Prisma schema
- created and applied the first domain migration
- added auth support migration for password reset tokens
- created and executed seed data for local development
- verified database access through Prisma Client and Prisma Studio

### Phase 3

Completed authentication and authorization foundation:
- configured `NextAuth` with `CredentialsProvider`
- added password hashing with `bcryptjs`
- implemented client self-signup
- implemented credentials-based login
- implemented forgot-password flow
- implemented reset-password flow
- added JWT session support
- added route protection through middleware
- added role-based redirects after login
- created protected base dashboards for all three roles
- verified registration, login, password reset token generation, and password update flow locally and on the deployed environment

### Phase 4

Completed private workspace foundation:
- built a shared dashboard shell with header, sidebar, and sign-out controls
- added role-aware layouts for `client`, `therapist`, and `admin`
- configured live role navigation for private routes
- created child routes for upcoming booking, payments, therapist, and admin modules
- implemented role-specific overview dashboards:
  - client workspace with upcoming sessions, payment summary, quick actions, and account summary
  - therapist workspace with pending requests, client summary, and profile/payout completion
  - admin workspace with users, approvals, bookings, payments, and recent activity
- added a server-side dashboard data layer in `dashboard.service.ts`
- made the private shell auth-aware by showing the signed-in user, current role, session state, and logout controls

## Implemented Routes

### Public routes

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Protected client routes

- `/client/dashboard`
- `/client/bookings`
- `/client/payments`

### Protected therapist routes

- `/therapist/dashboard`
- `/therapist/requests`
- `/therapist/clients`
- `/therapist/payout-details`

### Protected admin routes

- `/admin/dashboard`
- `/admin/users`
- `/admin/therapists`
- `/admin/bookings`
- `/admin/payments`

### Auth API

- `/api/auth/[...nextauth]`

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
- `Booking` represents booking state and scheduling intent
- `Session` represents the actual session entity and is linked one-to-one with `Booking`
- `Payment` is stored separately from `Booking`
- password recovery tokens are stored in `PasswordResetToken`
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
|- scripts/
|- src/
|  |- app/
|  |- components/
|  |- lib/
|  |- server/
|  |- types/
|  \- middleware.ts
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

Build the project:

```bash
npm run build
```

Generate Prisma client:

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

## Remote production / Vercel database

To avoid changing the local `.env` and accidentally pointing away from the local WSL database, use a separate `.env.production.local` file.

1. Copy the template:

```bash
cp .env.production.local.example .env.production.local
```

2. Paste the `DATABASE_URL` value from Vercel / Prisma Postgres into `.env.production.local`.

3. Run the remote Prisma commands with the dedicated scripts:

```bash
npm run prisma:migrate:remote
npm run prisma:seed:remote
```

These commands read `DATABASE_URL` only from `.env.production.local` and do not touch the local WSL database.

## Seed Test Accounts

The seed currently creates:
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

## Verification Summary

Verified in the current state:
- production build passes successfully
- registration creates `User` + `ClientProfile`
- credentials login works with hashed passwords
- forgot-password creates a valid reset token
- reset-password updates the stored password hash
- role-based redirects work for `client`, `therapist`, and `admin`
- the private shell loads with session-aware header and sidebar controls
- the deployed database can be migrated and seeded through the remote Prisma workflow

## Notes

- `middleware.ts` still works, but Next.js 16 warns that the file convention will move to `proxy.ts`
- transactional email sending is not connected yet; in development, reset links are logged on the server
- booking, payment, Google Calendar sync, and operational flows are still in upcoming phases
- if any remote database secret was exposed outside the expected environment, rotate it in Prisma Postgres / Vercel

## Next Step

The next planned phase is focused on real business modules:
- booking workflows
- therapist request handling
- payment flow preparation
- deeper role-specific pages built on top of the private shell
