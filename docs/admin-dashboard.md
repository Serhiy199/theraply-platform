# Admin Dashboard

## `/admin/dashboard`

Shows high-level admin entry points and recent operational context. Access requires the `ADMIN` role.

## `/admin/users`

Lists client users with email, names, active state, role, created/updated timestamps. It is read-only in the current MVP.

## `/admin/therapists`

Shows therapist profiles, approval state, Wix sync state, Google Calendar email, Stripe payout readiness, certificates, and review data.

Admin actions:

- approve therapist;
- reject therapist with reason;
- request changes with a message.

Approval sends email and attempts optional Wix sync. Rejection/request changes create audit logs and emails.

## `/admin/bookings`

Lists bookings and supports booking detail review. Admin can cancel eligible bookings. Admin cancellation deletes Google Calendar event when present, cancels the session, attempts a full refund for paid bookings, sends cancellation emails, and writes audit logs.

## `/admin/payments`

Shows payment summaries including amount, status, platform fee, therapist amount, refund state, transfer status, Stripe IDs, and booking relationship. This supports visibility into the 10/90 split.

Retry of failed transfers is implemented as `/api/cron/therapist-transfers`, protected by `CRON_SECRET`, not as a dedicated admin UI button.

## Audit Trail

`AuditLog` captures important auth, onboarding, booking, calendar, payment, refund, transfer, cron, and admin actions. Admin can inspect recent logs through dashboard services.

## Limitations

Mobile admin table density may require horizontal-scroll verification before final production handoff. Some operational actions are route/script based rather than exposed as polished admin buttons.
