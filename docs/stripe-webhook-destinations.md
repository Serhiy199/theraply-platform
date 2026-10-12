# Stripe Webhook Destinations

The same endpoint, `https://platform.theraply.online/api/stripe/webhook`, accepts
two explicitly separated Stripe destinations. Configuring them is a separate,
authorized operator action, not part of deploying this support.

| Destination scope | Environment variable | Accepted events |
| --- | --- | --- |
| Your account | `STRIPE_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `transfer.created`, existing legacy `transfer.failed` handling |
| Connected accounts channel | `STRIPE_CONNECT_WEBHOOK_SECRET` | `v2.core.account.updated` (thin), retained `account.updated` (legacy snapshot) |

Each destination has its own signing secret, for the intended Stripe mode.
Never reuse one secret for both destinations. Identical configured secrets fail
closed with a configuration error. Do not put real secrets in Git or logs.

The Connect variable is optional. With it absent, platform financial webhooks
continue working and unverified Connect events fail closed. Platform-signed
`account.updated` is ignored without database writes; it no longer updates
therapist Connect readiness. Configure the distinct Connected accounts
destination before relying on asynchronous readiness synchronization.

Verification uses the raw body and tries PLATFORM first, then CONNECTED_ACCOUNT.
Channel selection is based only on the verifying secret, never payload metadata.
Invalid signatures or malformed bodies return 400 without an AuditLog write.
Snapshot events of the wrong source/type are acknowledged and ignored before any
database access. Unsupported/malformed thin notifications return 400. Mode mismatch rejects before reservation. Owned Connect updates
require the stored account relationship and an active THERAPIST user; existing
LIVE fixture protections remain in force. Only canonical Stripe status fields
are updated. The existing event-ID reservation prevents duplicate processing;
non-unique-constraint database failures remain failures, not duplicate success.

Future operator checklist: select the appropriate TEST/LIVE mode, configure the
two scopes and their event lists, install their distinct secrets securely, then
obtain explicit approval for a controlled delivery test. No Dashboard mutation,
secret installation, mode switch or real delivery is included in this release.

## Account V2 thin support

The confirmed new destination delivers `v2.core.account.updated` with payload
style Thin. Its style does not need changing. Stripe Node SDK 22.1.0 provides
`parseEventNotification`; `webhooks.constructEvent` explicitly rejects V2
notifications. Raw-body signature verification determines the channel first.
Only then does the verified object discriminator select the appropriate parser.
The PLATFORM channel remains snapshot-only. Legacy `account.updated` retains
its separate snapshot handler for existing destinations.

The thin handler validates event ID, exact type, boolean livemode, ISO created
timestamp, optional context, and the account reference (`id`, `type`, canonical
relative `url`). It never expects `data.object` or uses metadata for ownership.
It does not fetch any URL supplied by the webhook. Signed malformed payloads,
unknown thin types and wrong-mode events cannot reserve an event or fetch Stripe.

Retrieval uses **strategy C**: `stripe.accounts.retrieve(accountId, {}, options)`
against `/v1/accounts/{accountId}`. Stripe explicitly supports retrieving Accounts
created in API v2 through API v1, returning the V1 Account representation.
No full-event retrieval or second resource request is needed. Verified context
is preserved as the SDK's `StripeContext` and passed as `stripeContext`, which
sets `Stripe-Context`. The request uses the configured server Stripe client and
`STRIPE_SECRET_KEY`; there is no fallback to a different platform's credentials.

The returned ID must equal the reference; `controller.is_controller` must be
true for the retrieving Connect application. The stored profile relationship
must resolve to an active THERAPIST. Unknown, mismatched, non-controller or
inaccessible accounts cannot update a profile. Existing LIVE fixture guards
still apply. The guarded update pins profile ID, user ID and Stripe Account ID.

| Authoritative V1 value | Existing Theraply field |
| --- | --- |
| `id` | Must match stored `stripeAccountId`; never assigned from metadata |
| `details_submitted` | `stripeDetailsSubmitted` |
| `payouts_enabled` | `stripePayoutsEnabled` |
| `charges_enabled` | `stripeChargesEnabled` |
| `requirements` | Existing requirements/disabled reason fields |

Readiness still requires Account ID + payouts enabled + details submitted.
No transfer capability is newly substituted for payouts readiness. Existing
onboarding status, completion/sync timestamps and requirements mapping are shared
with the legacy handler. Missing boolean status fields fail closed, not inferred.

Reservation and canonical status update run in one database transaction (15s
limit); retrieval has a 5s timeout and no in-request retry. Failure rolls back
reservation and status, including when ownership validation fails. The success
audit occurs only after commit. This prevents a transient fetch failure or
process failure before commit from leaving a completed event reservation.

| Outcome | HTTP / persistence |
| --- | --- |
| `INVALID_EVENT` | 400 before DB/Stripe access; generic verification response |
| `TRANSIENT_FETCH_FAILURE` | 503; transaction rollback, no success audit |
| `INVALID_ACCOUNT_STATE` | 503; no fabricated/stale status, transaction rollback |
| `UNOWNED_ACCOUNT` | 400; transaction rollback, no therapist mutation |
| `ALREADY_PROCESSED` | 200; existing committed event prevents another fetch/update |

## Next TEST configuration stage

A real E2E test requires `STRIPE_SECRET_KEY` (TEST),
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (TEST, for client flows),
`STRIPE_WEBHOOK_SECRET` (existing platform snapshot destination), and
`STRIPE_CONNECT_WEBHOOK_SECRET` (the actual new thin destination). All API keys
and destination secrets must belong to the **same new Stripe Platform Account
and sandbox**. The old platform's key must not be reused for new resources.
Keep secrets distinct and configure them through the separately authorized
environment stage. This code release installs no credentials or destinations.

Before real acceptance, verify that an emitted event references the intended
stored therapist account and its context. Stripe's scope rules distinguish
platform connected accounts from accounts representing customers/recipients of
connected accounts; receiving a nested account event does not authorize it as
a therapist. `v2.core.account.updated` covers top-level changes; capability and
requirements changes have more specific event types. This release adds only the
requested event, not a promise that this one type covers every onboarding change.
Any additional subscriptions/handlers require a separate review.

References:
- [Thin notification structure and SDK parsing](https://docs.stripe.com/events/how-events-work#thin-events)
- [V2 Accounts through V1 and event scope rules](https://docs.stripe.com/connect/accounts-v2/migrate-integration)
- [Stripe-Context](https://docs.stripe.com/context)
- [V1 Account retrieval](https://docs.stripe.com/api/accounts/retrieve)
