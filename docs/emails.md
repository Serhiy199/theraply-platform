# Emails

Email sending is routed through `sendTransactionalEmail`. Each attempt creates an `EmailLog` with `PENDING`, then marks it `SENT` or `FAILED`. Non-production uses console delivery and marks messages as sent. Production requires complete SMTP configuration.

## Auth Emails

| Email | Trigger | Recipient | Purpose |
| --- | --- | --- | --- |
| Email verification | Registration | New user | Confirm account email before full use |
| Password reset | Forgot password request | Existing active user | Provides reset flow in local console/non-production implementation |

## Therapist Onboarding Emails

| Email | Trigger | Recipient | Purpose |
| --- | --- | --- | --- |
| Pending review | Therapist submits onboarding | Therapist | Confirms submission was received |
| Approved | Admin approves profile | Therapist | Announces approval |
| Rejected | Admin rejects profile | Therapist | Shares rejection reason |
| Changes requested | Admin requests changes | Therapist | Shares requested edits |

## Booking And Payment Emails

| Email | Trigger | Recipient | Important data |
| --- | --- | --- | --- |
| Booking request created | Client creates booking | Client and therapist | Client, therapist, date/time, status, dashboard URL |
| Booking confirmed | Therapist confirms | Client | Session date/time, Meet/session link when available |
| Booking rejected | Therapist rejects | Client | Rejection reason when provided |
| Booking cancelled | Client/therapist/admin/cron cancellation | Client and therapist | Cancellation actor/reason, booking details |
| Payment successful | Stripe success or credit settlement | Client | Amount, payment status, booking details |
| Payment failed | Stripe failure or checkout expiry | Client | Amount, failure reason |

Refund/no-refund and completed/no-show do not currently have separate dedicated templates beyond cancellation/payment emails and audit/payment records.

## Logging Nuance

`EmailLog` stores user ID, email, template, subject, status, timestamps, and error message. It does not currently store a dedicated `bookingId` field. Booking-linked email auditing therefore requires correlating by user/template/time unless metadata is extended.
