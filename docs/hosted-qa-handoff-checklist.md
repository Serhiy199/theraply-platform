# Hosted QA Handoff Checklist

Use this checklist after deploying Theraply to the final hosting environment. It is intentionally focused on live/provider behavior that local scripts cannot fully prove.

## Preflight

- Confirm production/hosted env variables are present: app URLs, auth secret, database URL, Stripe, Google OAuth, SMTP, Cloudinary, Wix, and `CRON_SECRET`.
- Run `npx prisma migrate deploy` against the hosted database.
- Run `npx prisma migrate status` and confirm the database is up to date.
- Confirm the app domain and OAuth callback URLs match the hosted URL.
- Confirm Stripe webhook endpoint points to `/api/stripe/webhook`.
- Confirm cron trigger URLs and `CRON_SECRET` are configured on the final host.

## Client QA

- Register a new client.
- Verify email from the delivered email or console/test inbox.
- Log in as the client.
- Select a therapist and view available slots.
- Create a booking request.
- Confirm the client sees pending/confirmed booking states.
- Pay through Stripe Checkout in test mode.
- Confirm payment success page and client payment list update.
- Cancel a paid session more than 24 hours before start and verify refund behavior.
- Cancel a paid session less than 24 hours before start and verify no-refund warning.
- Try to open another client's booking/payment URL and confirm access is blocked.

## Therapist QA

- Register a new therapist.
- Verify therapist email.
- Complete therapist onboarding.
- Approve the therapist as admin.
- Connect Google Calendar.
- Select target Google Calendar.
- Connect Stripe account through Stripe Connect onboarding.
- Set session price.
- Confirm a booking request.
- Reject a booking request.
- Cancel a paid confirmed session and verify full refund.
- After session end, test `Mark completed`.
- After session end, test `Mark client no-show`.
- Confirm transfer status appears on therapist/admin payment views.

## Admin QA

- Open admin dashboard.
- Review users, therapists, bookings, payments, and audit logs.
- Approve and reject therapist applications.
- Cancel a booking manually.
- Inspect payment split: 10% platform, 90% therapist.
- Inspect transfer status and failure reason states.
- Retry a failed transfer if a test failure case is available.
- Confirm critical actions create audit log entries.

## Integrations QA

- Stripe Checkout success webhook updates payment to paid.
- Stripe payment failed webhook updates payment to failed.
- Stripe refund updates local payment/booking state.
- Stripe Connect account return/refresh updates therapist readiness.
- Stripe transfer success/failure updates transfer status.
- Google OAuth callback succeeds and rejects invalid state.
- Google Calendar availability loads from the connected calendar.
- Google Calendar event and Meet link are created on therapist confirmation.
- Google Calendar event is deleted on reject/cancel.
- SMTP sends registration, booking, cancellation, and payment emails.
- Cron endpoint rejects missing/wrong `CRON_SECRET`.
- Cron endpoint accepts correct `CRON_SECRET`.
- Booking rules cron handles unpaid overdue sessions.
- Therapist transfer cron retries pending/failed transfers.

## Screenshots And Video Evidence

- Client booking plus payment flow.
- Therapist onboarding, approval, booking request, completion/no-show.
- Admin payments view with 10%/90% split and transfer status.
- Stripe test payment, refund, webhook, and transfer dashboard evidence.
- Google Calendar event with Google Meet link.
- Email examples in the target inbox.
- Mobile views for login, booking, dashboard, and details pages.

## Known Production Follow-Ups

- Replace in-memory rate limiting with Redis/Upstash or another shared store if the app runs on multiple instances.
- Keep `TherapistPayoutDetails` as legacy compatibility storage unless a future cleanup migration is explicitly planned.
- Verify cron on the final hosting provider, not only Vercel, because hosting is expected to change.
