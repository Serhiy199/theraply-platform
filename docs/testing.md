# Testing

## Automated Commands

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run test:unit
npm run verify:security
npm run verify:phase10
npm run build
```

Additional scripts:

- `npm run verify:phase11-email`
- `npm run verify:email-records`
- `npm run verify:therapist-onboarding`
- `npm run verify:cron-booking-rules`
- `npm run test`

## Manual Acceptance Checklist

Client:

- Register.
- Verify email.
- Log in.
- Browse approved/bookable therapists.
- Create booking request.
- Pay through Stripe Checkout.
- View booking status, payment status, and session link.
- Test early and late cancellation scenarios.

Therapist:

- Register and verify email.
- Fill onboarding profile.
- Upload certificates.
- Save draft.
- Submit for review.
- Connect Google Calendar.
- Connect Stripe Connect.
- Confirm/reject/cancel booking.
- Mark completed and client no-show after session end.

Admin:

- Approve/reject/request changes for therapist.
- View users, therapists, bookings, payments, and audit logs.
- Cancel booking and verify refund behavior.
- Trigger or verify transfer retry cron route if a transfer fails.

Stripe:

- Test a GBP payment.
- Test a full refund.
- Test a 90% therapist transfer, for example GBP 45 transfer for a GBP 50 session.
- Test late client cancellation no-refund behavior.
- Verify webhook delivery and `StripeWebhookEvent` deduplication.

Google:

- Connect calendar.
- Confirm booking creates event and Meet link.
- Cancel/reject deletes event when implemented path has event metadata.
- Verify client and therapist can see the session link.

Emails:

- Verification.
- Therapist approval/rejection/changes requested.
- Booking request created.
- Booking confirmed.
- Booking rejected.
- Booking cancelled/refund-related scenarios.
- Payment successful/failed.
