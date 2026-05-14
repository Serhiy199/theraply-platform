# Phase 13.8 Audit Trail Completion

## Goal

Make critical business and security-sensitive operations traceable through `AuditLog`.

## Covered operations

### Therapist lifecycle

- `EMAIL_VERIFIED`
- `THERAPIST_ONBOARDING_DRAFT_SAVED`
- `THERAPIST_ONBOARDING_SUBMITTED_FOR_REVIEW`
- `ADMIN_APPROVE_THERAPIST`
- `ADMIN_REJECT_THERAPIST`

### Booking lifecycle

- `THERAPIST_CONFIRM_BOOKING`
- `THERAPIST_REJECT_BOOKING`
- `THERAPIST_CANCEL_BOOKING`
- `CLIENT_CANCEL_BOOKING`
- `ADMIN_CANCEL_BOOKING`
- Cron auto-cancel actions from `CRON_BOOKING_RULES_AUDIT_ACTIONS`

### Payment/refund lifecycle

- `PAYMENT_SETTLED_WITH_CLIENT_CREDIT`
- `STRIPE_CHECKOUT_SESSION_CREATED`
- `STRIPE_CHECKOUT_SESSION_CREATE_FAILED`
- `STRIPE_CHECKOUT_SESSION_RECONCILED_ON_SUCCESS_RETURN`
- `STRIPE_CHECKOUT_SESSION_COMPLETED`
- `STRIPE_PAYMENT_INTENT_FAILED`
- `STRIPE_CHECKOUT_SESSION_EXPIRED`
- `STRIPE_CHARGE_REFUNDED`
- `STRIPE_REFUND_CREATED`
- `STRIPE_REFUND_CREATE_FAILED`
- `STRIPE_REFUND_SKIPPED`
- `CLIENT_CREDIT_APPLIED`
- `CLIENT_CREDIT_REVERSED`
- `CLIENT_CREDIT_ISSUED`
- `CLIENT_COMPENSATION_CREDIT_SELECTED`

### Google Calendar lifecycle

- `GOOGLE_CALENDAR_CONNECT_STARTED`
- `GOOGLE_CALENDAR_CONNECTED`
- `GOOGLE_CALENDAR_DISCONNECTED`
- `GOOGLE_CALENDAR_TARGET_UPDATED`
- `GOOGLE_CALENDAR_EVENT_CREATED`
- `GOOGLE_CALENDAR_EVENT_DELETED`
- Google Calendar failure actions for connect/callback/read/create/delete/token refresh.

### Payout/profile operations

- `THERAPIST_PAYOUT_DETAILS_UPDATED`
- `THERAPIST_SESSION_PRICE_UPDATED`

## Notes

- Audit writes are best-effort in non-transactional paths so operational flows do not fail solely because audit logging failed.
- Core status transitions inside admin/booking/payout transactions use transactional audit writes where practical.
- Server diagnostic logs still contain provider-level error details; UI/API responses use safe messages from Phase 13.7.
