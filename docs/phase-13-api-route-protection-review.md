# Phase 13.6 API Route Protection Review

## Scope

Reviewed sensitive App Router API routes and added route-level throttling where it does not conflict with external provider retry behavior.

## Routes reviewed

### `/api/auth/[...nextauth]`

- Protection: NextAuth credentials flow.
- Rate limit: login is rate limited inside `src/auth.ts` by normalized email.
- Notes: OAuth/session internals remain delegated to NextAuth.

### `/api/stripe/checkout`

- Protection: authenticated user required.
- Role guard: fresh server-side `CLIENT` check via `requireCurrentActionRole`.
- Payload validation: `paymentCheckoutRequestSchema`.
- Ownership: payment service checks that the booking belongs to the client.
- Rate limit: `stripeCheckout` preset by user id.
- Audit/logging: handled in payment flow and email/payment layers.

### `/api/stripe/webhook`

- Protection: Stripe signature verification.
- Rate limit: intentionally not added.
- Reason: Stripe retries webhooks, and a local rate limit could block legitimate delivery bursts.
- Risk control: keep signature validation strict and avoid trusting unsigned payloads.

### `/api/integrations/google/connect`

- Protection: authenticated user required.
- Role guard: `THERAPIST` and approved therapist feature guard.
- Rate limit: `googleCalendarConnect` preset by therapist user id.
- Audit/logging: route start failures are logged.

### `/api/integrations/google/callback`

- Protection: authenticated user required.
- Role guard: `THERAPIST` and approved therapist feature guard.
- State check: OAuth state must match signed-in therapist user id.
- Rate limit: `googleCalendarConnect` preset by therapist user id.
- Audit/logging: mismatch, denied, missing code, and completion failures are logged.

### `/api/cron/booking-rules`

- Protection: `CRON_SECRET` bearer token using constant-time comparison.
- Rate limit: `cronBookingRules` preset by request IP.
- Audit/logging: cron service failures are logged with audit entries.
- Notes: cron business rules stay in a portable service layer; this route is only a trigger.

## Remaining notes

- Current rate limiting is in-memory. It is sufficient for the MVP/hardening foundation, but a multi-instance production deployment should move counters to Redis or another shared store.
- Stripe webhook must stay signature-first and should not be protected with session auth.
- Google Calendar duplicate calendar protection should remain in the data/service layer via the unique `googleCalendarId` constraint and friendly conflict handling.
