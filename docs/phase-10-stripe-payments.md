# Phase 10: Stripe Payments

This document reflects the implemented state of Phase 10.

## Scope

Phase 10 covers:

- therapist-confirmed sessions that become payable by the client
- `GBP` pricing stored per therapist
- Stripe Checkout for one-time payments
- webhook-driven payment synchronization
- refund logic
- client credit logic
- late cancellation policy
- admin finance visibility
- audit logging for the Stripe and credit lifecycle

## Implemented Business Rules

- the client pays the full session price, not a deposit
- payment is mandatory
- the therapist confirms first, then the client pays
- payment must be completed no later than `24 hours` before the session
- failed payment does not auto-cancel the booking
- the client can retry payment after failure
- client cancellation `24h+` can trigger refund logic if payment was captured
- client cancellation `< 24h` is still allowed but is treated as non-refundable once payment was captured
- platform-side paid cancellation can trigger refund logic
- compensation can be resolved either by refund or by platform credit

## Payment Flow

1. Client creates a booking request.
2. Therapist confirms or rejects it.
3. If rejected before payment:
   - no payment is created
   - no refund is needed
4. If confirmed:
   - booking becomes payable
   - therapist-specific `sessionPricePence` is used
   - `paymentDueBy` is stored as `startsAt - 24 hours`
5. Before Stripe Checkout:
   - any available client credit is applied automatically
   - if credit covers the whole amount, the booking is settled without opening Stripe
   - if credit covers part of the amount, Stripe charges only the remainder
6. Stripe webhooks finalize the authoritative payment state.

## Stripe Events

Implemented webhook handling:

- `checkout.session.completed`
- `payment_intent.payment_failed`
- `checkout.session.expired`
- `charge.refunded`

## Refund Logic

Implemented refund scenarios:

- client standard cancellation (`24h+`) after a paid session
- admin / platform-side cancellation after a paid session

Current behavior:

- refund creation happens through Stripe
- refunded payments are synchronized back into local `Payment`
- booking compensation is resolved through:
  - `compensationResolutionType`
  - `compensationResolvedAt`

Refund skip states are also logged:

- payment not found
- payment not paid
- already refunded
- late cancellation policy

## Client Credit Logic

Implemented credit capabilities:

- `ClientCreditBalance`
- `ClientCreditTransaction`
- issued credit
- applied credit
- reversed credit
- full-credit settlement
- partial-credit settlement
- restoring credit when checkout fails or expires
- restoring credit when a refunded payment previously used client credit

Transaction types in use:

- `ISSUED`
- `APPLIED`
- `REVERSED`

## Late Cancellation UX

The client booking details page now:

- shows whether the session is inside or outside the `24 hours` window
- explains the refund consequence before cancellation
- requires explicit acknowledgment for late cancellation
- distinguishes between:
  - standard cancellation with possible refund path
  - late cancellation without refund after payment capture

## Admin Finance Visibility

Implemented admin finance surfaces:

- `Pending checkout`
- `Failed payments`
- `Refunded payments`
- `Credit-backed payments`

Visibility is available on:

- admin dashboard overview
- admin payments page
- admin bookings table
- admin booking details

## Audit Logging

Implemented Stripe and credit audit events include:

- `STRIPE_CHECKOUT_SESSION_CREATED`
- `STRIPE_CHECKOUT_SESSION_CREATE_FAILED`
- `STRIPE_CHECKOUT_SESSION_COMPLETED`
- `STRIPE_PAYMENT_INTENT_FAILED`
- `STRIPE_CHECKOUT_SESSION_EXPIRED`
- `STRIPE_CHARGE_REFUNDED`
- `STRIPE_REFUND_CREATED`
- `STRIPE_REFUND_SKIPPED`
- `STRIPE_REFUND_CREATE_FAILED`
- `STRIPE_WEBHOOK_PROCESSING_FAILED`
- `PAYMENT_SETTLED_WITH_CLIENT_CREDIT`
- `CLIENT_CREDIT_ISSUED`
- `CLIENT_CREDIT_APPLIED`
- `CLIENT_CREDIT_REVERSED`

## Required Environment Variables

Stripe-related variables:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Local Stripe Testing

Recommended setup:

1. Use `pk_test` and `sk_test` from Stripe Dashboard.
2. Start local webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

3. Copy the CLI-provided `whsec_...` into local `.env`.

Useful local triggers:

```bash
stripe trigger checkout.session.completed
stripe trigger payment_intent.payment_failed
```

Automated verification command:

```bash
npm run verify:phase10
```

This script verifies the internal Phase 10 business flow without requiring live Stripe network calls. It covers:

- full payment settlement by client credit
- failed payment credit reversal
- expired checkout credit reversal
- webhook-driven payment completion
- webhook-driven refund state sync
- late cancellation refund-policy handling
- admin finance visibility and payment listings

## Hosted Test Mode

For Vercel or another hosted test environment:

- keep Stripe in `Test mode`
- create a hosted webhook endpoint:

```text
https://your-domain/api/stripe/webhook
```

- use that hosted endpoint signing secret as `STRIPE_WEBHOOK_SECRET`

## Current Outcome

By the end of Step 19, Phase 10 has:

- Stripe Checkout
- webhook-based payment sync
- refund flow
- client credit flow
- late cancellation UX
- admin finance visibility
- lifecycle audit logging
- env template documentation for local and hosted Stripe testing
- an automated end-to-end verification script for the internal payment lifecycle
