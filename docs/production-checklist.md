# Production Checklist

## 1. Production Env

- [ ] `DATABASE_URL` points to production PostgreSQL.
- [ ] `AUTH_SECRET` is long, random, and production-only.
- [ ] `NEXTAUTH_URL`, `APP_URL`, and `NEXT_PUBLIC_APP_URL` use the production domain.
- [ ] Stripe live publishable/secret keys are set.
- [ ] `STRIPE_WEBHOOK_SECRET` is set from the live webhook endpoint.
- [ ] Google OAuth client ID/secret and redirect URI match production.
- [ ] SMTP credentials are set and tested.
- [ ] Cloudinary certificate credentials are set.
- [ ] `CRON_SECRET` is set and used by scheduled calls.

## 2. Stripe

- [ ] GBP payment succeeds.
- [ ] Full refund succeeds.
- [ ] 90% transfer succeeds, for example GBP 45 on a GBP 50 session.
- [ ] Late client cancellation creates no refund and transfer eligibility.
- [ ] Webhook event is received and recorded.
- [ ] Stripe Connect account is ready in live mode.

## 3. Google

- [ ] Therapist connects calendar.
- [ ] Confirmed booking creates calendar event and Meet link.
- [ ] Cancellation/rejection deletes event when an event exists.
- [ ] Client and therapist can see the session link.

## 4. Emails

- [ ] Registration verification email.
- [ ] Therapist pending review/approval/rejection/changes requested emails.
- [ ] Booking request created emails.
- [ ] Booking confirmed email.
- [ ] Booking rejected email.
- [ ] Booking cancelled email.
- [ ] Payment successful/failed emails.
- [ ] Production SMTP failures are visible in `EmailLog`.

## 5. Admin

- [ ] Dashboard opens for admin only.
- [ ] Users page loads.
- [ ] Therapists page supports review actions.
- [ ] Bookings page loads and cancellation works for eligible bookings.
- [ ] Payments page shows amount, status, refund, transfer status, and 10/90 split.
- [ ] Audit logs show recent actions.
- [ ] Failed transfer retry is verified through `/api/cron/therapist-transfers`.

## 6. Evidence

- [ ] Client registration, verification, booking, payment.
- [ ] Therapist onboarding, certificates, approval, Google Calendar, Stripe Connect.
- [ ] Admin review flow.
- [ ] Admin payment view with 10/90 split.
- [ ] Stripe payment/refund/transfer screenshots.
- [ ] Google Calendar event and Meet link screenshots.
- [ ] Mobile smoke check for client, therapist, and admin tables.
