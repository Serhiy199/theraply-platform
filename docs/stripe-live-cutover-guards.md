# Stripe LIVE isolation

The centralized server-only fixture registry identifies immutable pre-LIVE
production TEST fixtures. These identities must never participate in future
LIVE financial operations. Booking relationships also protect unpaid fixtures.
Historical Stripe objects and database records are not converted or deleted.

Runtime mode comes from the secret key and must match the publishable key.
Webhook mode is checked after signature verification, before event reservation.
Connected-account updates require a stored, active THERAPIST relationship.
LIVE readiness and Connect operations exclude the known TEST therapist.

No financial arithmetic, Prisma schema, or migration changes are required.
Keys, webhooks, production cleanup and production promotion are separate gates.

## Targeted Wix soft depublication

The bundled command is default DRY_RUN and must not be run as part of deployment:

```sh
npm run wix:cms:reconcile-profile:production -- \
  --profile-id=<exact-profile-id> \
  --expected-wix-item-id=<exact-existing-item-id> \
  --confirm-production=WIX_PRODUCTION_DEPUBLISH_ONE
```

Only separately authorized execution may add `--write`. The runner requires
production CMS configuration and canonical production origin, exactly one
matching item, and fresh non-public readiness. It preserves all content and
only sets isPublished/isBookable false. A repeated operation is NO_CHANGE.
It cannot CREATE, delete, select all profiles, or write to the database.
