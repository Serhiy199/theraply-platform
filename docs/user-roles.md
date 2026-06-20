# User Roles

## Client

Clients can register, verify email, log in, view their dashboard, browse bookable therapists, request bookings, pay through Stripe Checkout, view booking/payment status, access session links, and cancel eligible bookings.

Bookable therapists are restricted to active therapist users with verified email, approved onboarding, completed profile, Stripe account data, payout readiness, and a session price.

## Therapist

Therapists can register, verify email, save onboarding drafts, submit a profile for review, upload certificates, connect Google Calendar, connect Stripe Connect, view booking requests, confirm/reject requests, cancel confirmed sessions, and mark paid sessions as completed or client no-show after the scheduled end time.

Pending, rejected, suspended, or incomplete therapist profiles are not shown to clients as bookable.

## Admin

Admins can view users, therapists, pending therapist reviews, bookings, payments, and audit logs. Admins can approve therapists, reject therapists, request changes, cancel bookings, and inspect payment/refund/transfer state.

The code exposes payment transfer visibility in admin payment summaries. Direct manual retry is implemented through the protected `/api/cron/therapist-transfers` route rather than an admin button in the current UI.

## Guards

- Unauthenticated users visiting `/client`, `/therapist`, or `/admin` are redirected to `/login`.
- Clients cannot access therapist or admin route groups.
- Therapists cannot access client or admin route groups.
- Admin route groups require the `ADMIN` role.
- Server logic uses session ownership checks for booking/payment actions.
