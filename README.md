# Theraply Platform

Ukrainian version: [README.ua.md](./README.ua.md)

Theraply Platform is a Next.js application for three core roles:
- clients
- therapists
- admins

The marketing website remains outside this repository. This project contains the product application that will run on the dedicated platform subdomain.

## Current Status

Completed phases:
- `Phase 1` ? project initialization
- `Phase 2` ? database design and local PostgreSQL bootstrap
- `Phase 3` ? authentication, password recovery, route protection, and base role dashboards

The current application already includes:
- `register` for client accounts
- `login` with `NextAuth` credentials
- `forgot password`
- `reset password`
- protected role-based routes
- base dashboard entry pages for `client`, `therapist`, and `admin`

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
- verified registration, login, password reset token generation, and password update flow locally

## Implemented Routes

### Public routes

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password/[token]`
- `/403`

### Protected routes

- `/client/dashboard`
- `/therapist/dashboard`
- `/admin/dashboard`

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
|- src/
|  |- app/
|  |- components/
|  |- lib/
|  |- server/
|  |- types/
|  \- middleware.ts
|- .env
|- .env.example
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

Create and apply a migration:

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

## Verification Summary For Phase 3

Verified locally:
- production build passes
- client registration creates `User` + `ClientProfile`
- credentials login works with hashed passwords
- forgot-password creates a valid reset token
- reset-password updates the stored password hash
- old password stops working after reset
- new password works after reset
- used reset token is invalidated

## Notes

- `middleware.ts` still works, but Next.js 16 warns that the file convention will later move to `proxy.ts`
- transactional email sending is not connected yet; in development, password reset links are logged on the server
- logout UI is not added yet, although the auth foundation is already in place

## Next Step

The next planned phase is:
- `Phase 4: Base dashboard experience and role-specific workspace expansion`

That phase will focus on:
- richer dashboard layouts
- navigation between dashboard sections
- first real content blocks for each role
- preparation for booking and payment flows
