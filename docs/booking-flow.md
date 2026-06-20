# Booking Flow

## Happy Path

1. Client opens the therapist booking page.
2. The app reads therapist availability from Google Calendar free/busy data and local active bookings.
3. Client selects a future 60-minute slot during configured business hours.
4. The server validates role, therapist bookability, date range, minimum lead time, Google busy conflicts, local conflicts, and a PostgreSQL advisory slot lock.
5. A `Booking` is created as `PENDING_THERAPIST`.
6. Booking request emails are sent to client and therapist.
7. Therapist confirms the request.
8. The app rechecks conflicts, creates a Google Calendar event with Google Meet, creates or updates the `Session`, sets booking status to `CONFIRMED`, and sets `paymentDueBy` to 24 hours before session start.
9. Client starts Stripe Checkout from the client payment flow.
10. Stripe webhook or success-page reconciliation marks payment as `PAID`.
11. Client and therapist can see the booking/session link.
12. After the session end, therapist marks the session completed or client no-show, which creates the delayed therapist transfer when eligible.

## Rejection

Therapist can reject only `PENDING_THERAPIST` bookings. Rejection sets `BookingStatus.REJECTED`, cancels any session if present, deletes linked Google event if present, logs audit data, and sends a rejection email to the client.

## Cancellation

- Therapist cancellation of a confirmed booking deletes the Google event, cancels the session, and triggers full refund for paid bookings.
- Admin cancellation follows platform cancellation behavior with Google event deletion and refund attempt.
- Client cancellation is governed by the 24-hour policy: more than 24 hours before session gets a refund if paid; less than 24 hours before session is non-refundable and may result in therapist transfer.
- Unpaid confirmed bookings can be auto-cancelled by cron after the payment deadline.

## Duplicate Slot Prevention

The booking service checks active local bookings (`PENDING_THERAPIST`, `CONFIRMED`), reads Google free/busy ranges, enforces future/minimum lead time, and uses a PostgreSQL advisory transaction lock around slot creation.

## Relationships

`Booking` owns the high-level lifecycle. `Session` stores meeting/calendar data. `Payment` stores Stripe, refund, credit, fee, and transfer state. Calendar data is attached to `Session`; payment data is attached to `Booking` through a one-to-one `Payment`.
