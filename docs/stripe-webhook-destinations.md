# Stripe Webhook Destinations

The same endpoint, `https://platform.theraply.online/api/stripe/webhook`, accepts
two explicitly separated Stripe destinations. Configuring them is a separate,
authorized operator action, not part of deploying this support.

| Destination scope | Environment variable | Accepted events |
| --- | --- | --- |
| Your account | `STRIPE_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `transfer.created`, existing legacy `transfer.failed` handling |
| Connected accounts | `STRIPE_CONNECT_WEBHOOK_SECRET` | `account.updated` only |

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
Valid events of the wrong source/type are acknowledged and ignored before any
database access. Mode mismatch rejects before reservation. Owned Connect updates
require the stored account relationship and an active THERAPIST user; existing
LIVE fixture protections remain in force. Only canonical Stripe status fields
are updated. The existing event-ID reservation prevents duplicate processing;
non-unique-constraint database failures remain failures, not duplicate success.

Future operator checklist: select the appropriate TEST/LIVE mode, configure the
two scopes and their event lists, install their distinct secrets securely, then
obtain explicit approval for a controlled delivery test. No Dashboard mutation,
secret installation, mode switch or real delivery is included in this release.
