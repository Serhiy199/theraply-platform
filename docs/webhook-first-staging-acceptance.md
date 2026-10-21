# Temporary Webhook-First Staging Acceptance

## Scope and Default

`STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID` is an optional, server-only variable.
Leave it absent or empty until the owner authorizes a new disposable staging
booking and its exact CUID is recorded. No booking ID is configured by this release.
Do not configure this variable on the production VPS, main, or other projects.
There is no query parameter, request header, cookie, or UI switch to enable it.

The guard requires ALL of:

- One exact Booking CUID matching the booking being read (no lists/wildcards).
- Consistent Stripe TEST secret and publishable key modes.
- `VERCEL=1`.
- `VERCEL_PROJECT_ID=prj_V23l6neyJoyjb46Lc5zXsEGGNMDU`.
- `VERCEL_GIT_COMMIT_REF=develop`.
- `VERCEL_ENV=production`: this dedicated Vercel project's production alias is
  Theraply STAGING, not the real production VPS.
- `APP_URL` is the canonical root `https://theraply-platform.vercel.app`.
- PostgreSQL `postgres/public` on a `.prisma.io` hostname.

Missing, invalid, or mismatched context leaves normal reconciliation unchanged.
The project/branch/URL checks are essential: `NODE_ENV=production` alone cannot
distinguish the staging build from actual production. Before future activation,
independently verify the effective deployment and staging DB identity read-only.

## Reconciliation Entry Points

The success page still authenticates an active CLIENT with `requireRole`.
With `bookingId` and `session_id` (except the existing credit-only return), it
calls `syncClientStripeCheckoutSuccess`. That service still performs Stripe
financial isolation and the `bookingId + authenticated clientId` ownership query
BEFORE evaluating the guard. It never skips authorization for another client.

For the selected booking only, the guard skips all success-return Stripe reads,
payment writes and success emails. It emits the non-secret runtime marker
`STAGING_WEBHOOK_FIRST_SUCCESS_RETURN_SKIPPED` with only the Booking ID. The page
then reads the current owned booking normally: pending stays pending; a Payment
already marked paid by the webhook is displayed as paid without another write.

`POST /api/stripe/webhook` remains unchanged. Its signed PLATFORM
`checkout.session.completed` and `payment_intent.succeeded` handlers still use
the canonical financial snapshot and can transition this Payment to PAID.
The only non-webhook caller of checkout-success reconciliation is the success
page. Cron expiry marks expired payments FAILED, not PAID. The separate normal
credit settlement path is not changed; the future test must use zero credit/promo.

## Future Activation and Acceptance (Separate Execution)

1. Verify the exact staging deployment, TEST Platform, active staging destination,
   disabled production-directed TEST destinations, therapist readiness and TEST
   calendar. Preserve the previous booking/payment and historical fingerprints.
2. Through normal CLIENT UI, create exactly one newly authorized disposable
   booking. Record its ID, client, therapist, slot and normal confirmation/event.
   Do not start Checkout yet. Never use a historical Booking ID for the guard.
3. Only after that ID is known, set the single staging Vercel variable to that
   exact ID and redeploy develop to staging. Do not change keys or destinations.
4. Reverify all effective guard conditions. With an authorized CLIENT, open the
   selected success URL using `bookingId=<new ID>&session_id={CHECKOUT_SESSION_ID}`
   BEFORE creating Checkout. The literal template is not a real Stripe object.
   Require the exact SKIPPED runtime marker and no Stripe read/payment write.
   Missing marker means STOP before Checkout/payment; do not rely on UI copy.
5. Start ONE normal TEST Checkout for GBP 2.99 (session 100p + fee 199p), zero
   promo/credit. Capture Payment PENDING, paidAt null, actual Checkout ID and
   financial fingerprints before owner payment. Owner enters the TEST card and
   completes the payment personally. Browser request blocking is not required.
6. Correlate actual signed PLATFORM events, handler audit and webhook reservation
   with the new Payment. Prove PENDING -> PAID and preserve the original paidAt.
   Capture SKIPPED markers if Stripe navigates to success. Require no
   `STRIPE_CHECKOUT_SESSION_RECONCILED_ON_SUCCESS_RETURN` for the new Payment.
   A webhook reservation timestamp alone is not handler-completion evidence.
7. Verify CLIENT/THERAPIST/ADMIN UI, one Payment/Session/Checkout/calendar event,
   90p therapist + 10p platform session share + 199p platform fee, no refund or
   transfer. No resend, cancellation, session completion or automatic cleanup.

## Removal After Acceptance

First capture the causal evidence. Remove only the staging booking-ID variable
and redeploy the same develop release to staging; confirm it is absent and the
guard is inactive. Do not revisit the old success URL just to test removal and
do not reset financial data. Then remove the temporary helper, its service
import/branch and pending-result reason, guard-only tests/helper, example entry
and this runbook through a separately reviewed develop-only cleanup commit.
Retain permanent reconciliation/auth/webhook regression tests. Repeat unit,
TypeScript, ESLint, security and build gates before that cleanup release.
