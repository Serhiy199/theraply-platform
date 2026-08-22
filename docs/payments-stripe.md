# Stripe Payments

## Overview

Theraply uses Stripe Checkout for client payments and Stripe Connect for therapist payouts. The implementation uses separate charges and transfers: the platform collects the charge, stores the charge and transfer metadata, then creates a delayed transfer to the connected therapist account after a settlement event.

## Checkout

Payment becomes available only after therapist confirmation. The checkout service verifies:

- booking belongs to the current client;
- booking is `CONFIRMED`;
- therapist has a session price;
- therapist Stripe Connect account is ready;
- payment deadline has not passed;
- payment is not already paid, pending, or refunded.

Checkout metadata includes the payment ID, booking, client, therapist, gross amount,
frozen promo snapshot, client payable amount, applied client credit, Stripe charge,
platform revenue, and therapist amount. Metadata is consistency evidence only;
the database `Payment` snapshot remains authoritative.

## Amounts

- Currency: GBP.
- The server applies promo discount first, then client credit, then creates a
  Stripe charge for the remaining client payable amount.
- Platform fee: 10%.
- Therapist transfer: 90%.

The split is defined in `src/lib/constants/payments.ts`.

## Webhook Events

Handled Stripe events:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `account.updated`
- `transfer.created`
- `transfer.failed`

Processed webhook event IDs are stored in `StripeWebhookEvent` to avoid duplicate processing.

## Stripe Connect

Therapists start onboarding through `/api/stripe/connect/account-link`. The platform creates/uses a Stripe Express connected account, creates an account link, and syncs status on return and on `account.updated` webhooks.

Payments are blocked until the therapist profile has a Stripe account with ready charges/payouts/details state according to `isStripeConnectReady`.

## Transfers

Transfers are created after:

- session completed;
- client no-show;
- late client cancellation less than 24 hours before start.

When the captured Stripe charge can fund the therapist amount, the transfer uses
the original charge as `source_transaction`. Promo plus credit combinations that
leave a smaller Stripe charge use the existing platform-funded transfer path.
Both paths keep the booking transfer group and payment-based idempotency key.
Failed or pending transfers can be retried through `/api/cron/therapist-transfers`.

## Refunds And No-Refund Rules

- Therapist cancellation: full Stripe refund for paid bookings.
- Admin/platform cancellation: full Stripe refund attempt for paid bookings.
- Client cancellation more than 24 hours before session: full refund.
- Client cancellation less than 24 hours before session: no refund and transfer eligible.
- Completed session: no refund; therapist receives 90%.
- Client no-show: no refund; therapist receives 90%.
- Reschedule keeps payment attached only if/when a full reschedule flow is implemented.

## Production Dependency

Real behavior depends on live Stripe keys, active Stripe Connect capability, webhook endpoint configuration, and successful webhook delivery.

## Test Scenarios

- GBP session payment through Checkout.
- Webhook marks payment as paid.
- Payment failure and checkout expiry.
- Full refund.
- Completed/no-show transfer.
- Late client cancellation transfer.
- `account.updated` readiness sync.
- Failed transfer retry through cron route.

## Promo Snapshot Foundation

Promo codes are normalized with `trim().toUpperCase()` and are valid only when
they contain 3-32 characters from `A-Z`, `0-9`, `-`, and `_`. Discounts are
integer percentages from 1 through 10 and are funded entirely from Theraply's
platform share. A therapist's gross-based payout does not decrease.

`Payment.amount` remains the original gross booking amount. Promo checkout
persists the nullable promo fields to preserve the code,
percentage, discount amount, client payable amount, and Stripe charge amount as
an immutable payment-time snapshot. `platformFeeAmount` represents final
platform revenue after the promo discount. Existing payments keep these new
fields null and use the no-promo calculation fallback.

Clients preview a code through `POST /api/promocodes/preview`. The endpoint and
checkout both require a CLIENT account that owns a payable booking. Preview is
informational; checkout accepts only `bookingId` and optional `promoCode`, then
revalidates active state, expiry, percentage, ownership, and booking eligibility
inside the payment transaction. A pending or paid Payment never reads current
PromoCode state during reconciliation.

Refunds return only the captured Stripe amount and restore only the frozen client
credit amount. Promo discount is never issued as credit. Incomplete modern
snapshots and Stripe amount/metadata mismatches fail closed.

Admin promo management uses `/admin/promocodes`. Codes are immutable after
creation and are never hard-deleted. Discount percentage can be edited only
until the first Payment references the PromoCode; expiry and active state remain
editable afterward. The admin `Uses` count is the number of associated Payment
records, regardless of their final payment status.
