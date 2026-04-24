# Phase 10: Stripe Payments

This document fixes the agreed business and implementation scenario for Phase 10 so Stripe work can continue without ambiguity.

## Final Scope

Phase 10 is built around therapist-confirmed sessions that become payable by the client after confirmation.

Implemented business direction for this phase:

- the client pays the full session price, not a deposit
- payment is mandatory
- the therapist confirms first, and only then the client pays
- payment must be completed no later than 24 hours before the session
- pricing is therapist-specific
- currency is `GBP`
- Stripe integration uses `Stripe Checkout`
- payment state is synchronized through `Stripe webhooks`
- failed payment does not automatically cancel the booking
- the client can retry payment after a failed attempt
- refund logic is required in MVP
- credit logic is also required in MVP and is treated as a separate domain submodule

## Source Of Truth

- Theraply remains the source of truth for booking state
- Stripe remains the source of truth for payment event confirmation
- booking and payment state are tracked separately

Current booking status model:

- `PENDING_THERAPIST`
- `CONFIRMED`
- `REJECTED`
- `CANCELLED`
- `AUTO_CANCELLED`
- `COMPLETED`

Current payment status model:

- `UNPAID`
- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`

## Agreed User Flow

1. Client creates a booking request.
2. Therapist confirms or rejects the request.
3. If rejected before payment:
   - no payment is created
   - no refund is needed
   - the client can return to therapist selection and choose another slot
4. If confirmed:
   - booking is confirmed
   - the Google Calendar event is created
   - the meeting link appears in therapist and client dashboards
   - the client sees an обязательну оплату for that session
5. The client completes payment through Stripe Checkout.
6. Stripe webhooks update payment state in Theraply.

## Failed Payment Logic

When payment is unsuccessful:

- `bookingStatus` does not change to `CANCELLED`
- `paymentStatus = FAILED`
- the client is allowed to retry payment

## Cancellation And Refund Rules

### Client cancellation

If the client cancels at least 24 hours before the session:

- cancellation is allowed
- refund logic is allowed

If the client cancels less than 24 hours before the session:

- cancellation is still allowed
- the UI must show a warning before confirmation
- the booked time is treated as non-refundable

### Therapist rejection before payment

If the therapist rejects before the client pays:

- no payment is created
- no refund is needed

### Therapist cancellation after payment

If the therapist cancels after the client has already paid:

- the client must receive compensation
- compensation can be:
  - full refund
  - platform credit for a future session

## Credit Logic

Credit support is explicitly in scope for MVP.

That means the platform must support:

- client balance tracking
- credit issuance
- credit application to a future session
- partial credit usage
- credit history
- credit visibility in the client cabinet
- admin visibility over refund and credit cases

## Pricing Rules

- currency: `GBP`
- the session price is different for each therapist
- the price is stored at therapist profile level
- implementation should use the smallest currency unit:
  - `pence`
  - example: `7500` = `£75.00`

## Stripe Integration Rules

Phase 10 should use:

- `Stripe Checkout`
- `Stripe webhooks`

Local development:

- Stripe webhook testing will run through `Stripe CLI`

Production:

- the final webhook URL will be added later when the production domain is ready

## Stripe Events Required For MVP

The minimum agreed Stripe events are:

- `checkout.session.completed`
- `payment_intent.payment_failed`
- `checkout.session.expired`
- `charge.refunded`

Optional fallback if needed:

- `payment_intent.canceled`

## Email Boundary

Full payment email logic is not part of Phase 10.

That means:

- `payment success`
- `payment failed`
- `refund confirmation`
- `credit notification`

should be implemented in `Phase 11`, not inside the Stripe phase itself.

## Admin Visibility

Admin involvement is required for commercial safety.

The admin side should be able to see:

- therapist cancellation after payment
- failed payments
- expired checkout sessions
- refund cases
- credit issuance cases

The recommended MVP approach is:

- log every important payment and compensation event in `AuditLog`
- surface critical refund and credit cases in the admin workspace

## Required Environment Variables

Phase 10 expects these Stripe variables:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

They can exist as empty placeholders during the early implementation steps, but real Stripe integration testing requires actual values.

## End-Of-Step Outcome

After Step 1, the payment contract is fixed:

- pricing model is agreed
- payment timing is agreed
- failed payment logic is agreed
- refund and credit rules are agreed
- `24 hours` cancellation policy is agreed
- Stripe integration direction is agreed
- admin visibility expectations are agreed
