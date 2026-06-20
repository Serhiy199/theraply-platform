# Architecture

Theraply is a Next.js `16.2.2` App Router application. UI routes and API route handlers live under `src/app`, shared contracts and constants live under `src/lib`, and server-side domain logic lives under `src/server/services`.

## Roles

- Client accounts own client profiles and create bookings.
- Therapist accounts own therapist profiles, onboarding state, Google Calendar connection state, Stripe Connect state, certificates, and booking requests.
- Admin accounts review therapists and operate the admin dashboard.

Role access is enforced by `src/proxy.ts` for `/client`, `/therapist`, and `/admin` route prefixes. Server actions and API routes also resolve the current session instead of trusting client-provided ownership.

## Core Modules

- Auth: `src/auth.ts`, `src/server/services/auth.service.ts`, email verification, password reset, JWT sessions.
- Therapist onboarding: draft/submission validation, certificate upload, admin review, approval/rejection/request changes.
- Booking/session: client booking requests, therapist confirmation/rejection/cancellation, session completion/no-show, duplicate slot prevention.
- Payments: Stripe Checkout, payment records, client credit, refunds, delayed Stripe Connect transfers.
- Calendar: Google OAuth, free/busy availability, target calendar selection, event and Google Meet creation/deletion.
- Email: Nodemailer delivery, console delivery outside production, `EmailLog` tracking.
- Admin/audit: dashboard queries, therapist review actions, booking cancellation, payments visibility, `AuditLog`.

## Data Model

Prisma models include `User`, `ClientProfile`, `TherapistProfile`, `TherapistCertificate`, `TherapistReviewNote`, `Booking`, `Session`, `Payment`, `StripeWebhookEvent`, `ClientCreditBalance`, `ClientCreditTransaction`, `TherapistPayoutDetails`, `EmailLog`, `AuditLog`, `PasswordResetToken`, and `EmailVerificationToken`.

Important enums include `UserRole`, `TherapistApprovalStatus`, `BookingStatus`, `SessionStatus`, `SessionOutcome`, `PaymentStatus`, `PaymentTransferStatus`, and `StripeConnectOnboardingStatus`.

## External Services

- Stripe Checkout and Stripe Connect power payment collection and therapist transfers.
- Google Calendar API powers availability, calendar events, and Google Meet links.
- SMTP via Nodemailer sends transactional emails in production.
- Cloudinary stores therapist certificate uploads.
- Wix sync exists for approved therapist submission synchronization, but it is optional/config-dependent.

## Hosting Assumptions

The app needs a Node.js-capable host, a PostgreSQL database, environment variables, Stripe webhook delivery, Google OAuth redirect configuration, SMTP access, Cloudinary credentials, and scheduled calls to cron route handlers. `vercel.json` currently defines cron calls for booking rules and therapist transfer retries.
