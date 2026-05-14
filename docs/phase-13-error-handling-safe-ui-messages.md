# Phase 13.7 Error Handling & Safe UI Messages

## Goal

Keep production UI and API responses free from raw database, Prisma, Stripe, Google, and provider errors while preserving technical diagnostics on the server side.

## Implemented

- Added shared safe error mapping in `src/lib/errors/safe-error-messages.ts`.
- Updated sensitive server actions to return typed states with friendly messages:
  - client booking creation/cancellation/compensation
  - therapist request decisions/session cancellation
  - therapist onboarding/certificate upload
  - therapist payout/calendar selection
  - admin booking cancellation
  - admin therapist approve/reject
  - auth register/forgot/reset/resend verification
- Updated API routes to avoid raw provider errors in responses:
  - Stripe Checkout
  - Stripe webhook
  - Google Calendar connect/callback
- Updated client therapist availability page to show a safe availability issue instead of a raw Google availability service message.

## Server diagnostics

Technical error details remain server-side only through existing diagnostic/audit logging:

- `logDiagnosticEvent(...)`
- `createAuditLogEntryBestEffort(...)`
- scoped `console.error(...)` calls in server services/pages

## Notes

- Field-level validation errors are still shown where they are authored by local Zod schemas.
- Permission errors are normalized to a generic "permission denied" UI message.
- Stripe webhook keeps signature verification details in server logs but returns a safe response body.
- External provider messages are mapped by error code before reaching the UI.
