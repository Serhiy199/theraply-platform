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

Checkout metadata includes booking, client, therapist, gross amount, platform fee amount, therapist amount, and any applied client credit.

## Amounts

- Currency: GBP.
- Client pays the full session amount, unless client credit covers part or all of it.
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

The transfer uses the original charge as `source_transaction`, the booking transfer group, and an idempotency key based on the payment ID. Failed or pending transfers can be retried through `/api/cron/therapist-transfers`.

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
